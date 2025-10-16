import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Initialize OpenAI and Supabase clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Ensure Supabase bucket exists
async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === name)) {
    await supabase.storage.createBucket(name, { public: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, mode, userId, metadata } = body;

    if (!prompt || !mode || !userId) {
      return NextResponse.json(
        { error: "`prompt`, `mode`, and `userId` are required" },
        { status: 400 }
      );
    }

    const bucket = "generated";
    await ensureBucket(bucket);

    // Prepare the final prompt
    let finalPrompt = prompt;

    // If generating scene, include character image in prompt
    if (mode === "scenes") {
      const { data: characterData } = await supabase
        .from("characters")
        .select("image_url")
        .eq("user_id", userId)
        .single();

      if (!characterData?.image_url) {
        return NextResponse.json(
          { error: "Character image not found. Generate character first." },
          { status: 400 }
        );
      }

      finalPrompt += ` Include the main character from this image in the scene: ${characterData.image_url}`;
    }

    // Generate image using OpenAI
    const aiResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
      n: 1,
    });

    const b64 = aiResp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image data returned from OpenAI" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const filePath = `${mode}/${Date.now()}.png`;

    // Upload image to Supabase
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

    // Supabase v2: getPublicUrl returns { data: { publicUrl } }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      return NextResponse.json({ error: "Failed to get public URL" }, { status: 500 });
    }

    // Store in Supabase DB
    if (mode === "character") {
      await supabase.from("characters").insert({
        user_id: userId,
        name: metadata?.name || "",
        image_prompt: prompt,
        image_url: publicUrl,
      });
    } else if (mode === "scenes") {
      await supabase.from("scenes").insert({
        user_id: userId,
        image_prompt: prompt,
        image_url: publicUrl,
      });
    }

    return NextResponse.json({ imageUrl: publicUrl, filePath });
  } catch (err: any) {
    console.error("genImage error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
