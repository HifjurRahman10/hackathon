import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === name)) {
    await supabase.storage.createBucket(name, { public: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt: userPrompt, mode, userId, metadata } = body;

    if (!userPrompt || !mode || !userId) {
      return NextResponse.json(
        { error: "`prompt`, `mode`, and `userId` are required" },
        { status: 400 }
      );
    }

    const bucket = "generated";
    await ensureBucket(bucket);

    // Final prompt to send to OpenAI
    let finalPrompt = userPrompt;

    // For scenes, include character image info in the prompt
    if (mode === "scenes") {
      const { data: characterData, error } = await supabase
        .from("characters")
        .select("image_url")
        .eq("user_id", userId)
        .single();

      if (error || !characterData?.image_url) {
        return NextResponse.json({ error: "Character image not found" }, { status: 400 });
      }

      finalPrompt += ` Include the main character from this image URL in the scene: ${characterData.image_url}`;
    }

    // Generate image
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
      n: 1,
    });

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image data returned from OpenAI" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const filePath = `${mode}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    const { data: urlData, error: urlError } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    if (urlError || !urlData?.publicUrl) {
      return NextResponse.json({ error: "Failed to get public URL" }, { status: 500 });
    }

    const imageUrl = urlData.publicUrl;

    // Store in Supabase
    if (mode === "character") {
      await supabase.from("characters").insert({
        user_id: userId,
        name: metadata?.name || "",
        image_prompt: userPrompt,
        image_url: imageUrl,
      });
    } else if (mode === "scenes") {
      await supabase.from("scenes").insert({
        user_id: userId,
        image_prompt: userPrompt,
        image_url: imageUrl,
      });
    }

    return NextResponse.json({ imageUrl, filePath });
  } catch (err: any) {
    console.error("genImage error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
