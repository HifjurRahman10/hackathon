import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Ensure the private bucket exists
async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === name)) {
    await supabase.storage.createBucket(name, { public: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, chatId, sceneNumber, userId, force } = await req.json();

    if (!prompt || !chatId || sceneNumber === undefined || !userId) {
      return NextResponse.json(
        { error: "`prompt`, `chatId`, `sceneNumber`, and `userId` are required" },
        { status: 400 }
      );
    }

    const bucket = "user_upload";
    await ensureBucket(bucket);

    // Unique path per user/chat/scene
    const fileName = `${sceneNumber}_${Date.now()}.png`;
    
    const filePath = `${userId}/${chatId}/${fileName}`;

    // Optional: skip generation if file exists
    if (!force) {
      const { data: existing } = await supabase.storage.from(bucket).list(`${userId}/${chatId}`);
      if (existing?.some(f => f.name === fileName)) {
        const { data: urlData, error: urlError } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60);
        if (!urlError && urlData) {
          return NextResponse.json({ imageUrl: urlData.signedUrl, path: filePath });
        }
      }
    }

    // Generate image with OpenAI
    const aiResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
      quality: "low",
    });

    const b64 = aiResp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image data returned from OpenAI" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");

    // Upload image to private Supabase bucket
    const { error: uploadError } = await supabase
      .storage
      .from(bucket)
      .upload(filePath, buffer, {
        upsert: true,
        contentType: "image/png",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    // Generate signed URL valid for 1 hour
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60);

    if (signedUrlError) {
      console.error("Signed URL error:", signedUrlError);
      return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
    }

    // Store the **file path** in the DB (not the signed URL)
    await supabase
      .from("scenes")
      .update({ image_url: filePath })
      .eq("chat_id", chatId)
      .eq("scene_number", sceneNumber);

    // Return signed URL for immediate display
    return NextResponse.json({ imageUrl: signedUrlData.signedUrl, path: filePath });
  } catch (err: any) {
    console.error("genImage error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
