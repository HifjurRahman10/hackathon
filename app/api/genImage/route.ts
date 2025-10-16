// app/api/genImage/route.ts
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
    const { prompt, type, recordId, metadata, userId } = body;

    if (!prompt || !type) {
      return NextResponse.json(
        { error: "`prompt` and `type` are required" },
        { status: 400 }
      );
    }

    const mode = type; // map frontend "type" to internal "mode"
    const bucket = "generated";
    await ensureBucket(bucket);

    let finalPrompt = prompt;

    // If scene, include character image
    if (mode === "scene") {
      if (!userId) {
        return NextResponse.json(
          { error: "`userId` is required for scene generation" },
          { status: 400 }
        );
      }

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

    // Generate image via OpenAI
    const aiResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
      n: 1,
    });

    const b64 = aiResp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "No image data returned from OpenAI" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(b64, "base64");
    const filePath = `${mode}/${Date.now()}.png`;

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Get public URL (Supabase v2)
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (!urlData?.publicUrl) {
      return NextResponse.json(
        { error: "Failed to get public URL" },
        { status: 500 }
      );
    }

    const publicUrl = urlData.publicUrl;

    // Update DB record instead of inserting new one
    if (mode === "character" && recordId) {
      await supabase.from("characters").update({
        image_url: publicUrl,
      }).eq("id", recordId);
    } else if (mode === "scene" && recordId) {
      await supabase.from("scenes").update({
        image_url: publicUrl,
      }).eq("id", recordId);
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
