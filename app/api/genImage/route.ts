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

// Ensure Supabase bucket exists and is public
async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const existingBucket = buckets?.find((b) => b.name === name);
  
  if (!existingBucket) {
    await supabase.storage.createBucket(name, { public: true });
  } else if (!existingBucket.public) {
    await supabase.storage.updateBucket(name, { public: true });
  }
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { prompt, type, recordId, metadata, userId } = body;

    if (!prompt || !type) {
      return NextResponse.json(
        { error: "`prompt` and `type` are required" },
        { status: 400 }
      );
    }

    const mode = type;
    const bucket = "user_upload";
    await ensureBucket(bucket);

    if (!userId) {
      return NextResponse.json(
        { error: "`userId` is required" },
        { status: 400 }
      );
    }

    let finalPrompt = prompt;
    let chatId = metadata?.chatId || "default-chat";

    // If scene, include character image
    if (mode === "scene") {
      const { data: characterData } = await supabase
        .from("characters")
        .select("character_image_url")
        .eq("chat_id", chatId)
        .single();

      if (characterData?.character_image_url) {
        finalPrompt += ` Include the main character from this image in the scene: ${characterData.character_image_url}`;
      }
    }

    // Generate image via OpenAI
    let aiResp;
    try {
      aiResp = await openai.images.generate({
        model: "gpt-image-1",
        prompt: finalPrompt,
        quality: "low",
        n: 1,
      });
    } catch (openaiError: any) {
      console.error("OpenAI API error:", openaiError);
      return NextResponse.json(
        { error: openaiError.message || "Failed to generate image" },
        { status: 502 }
      );
    } 
    const b64 = aiResp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "No image data returned from OpenAI" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(b64, "base64");
    const timestamp = Date.now();
    const filePath = `${userId}/${chatId}/${mode}_image_${timestamp}.png`;

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

    // Update DB record if valid recordId provided
    if (mode === "character" && recordId && recordId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { error: updateError } = await supabase.from("characters").update({
        character_image_url: publicUrl,
      }).eq("id", recordId);
      
      if (updateError) {
        console.error("Failed to update character record:", updateError);
      }
    } else if (mode === "scene" && recordId && recordId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { error: updateError } = await supabase.from("scenes").update({
        image_url: publicUrl,
      }).eq("id", recordId);
      
      if (updateError) {
        console.error("Failed to update scene record:", updateError);
      }
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
