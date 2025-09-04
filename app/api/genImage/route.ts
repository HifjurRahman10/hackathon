import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // prefer service key on server
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE || SUPABASE_ANON,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === name)) {
    await supabase.storage.createBucket(name, { public: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, chatId, sceneNumber, userId, force } = await req.json();

    if (!prompt || !chatId || sceneNumber === undefined || sceneNumber === null || !userId) {
      return NextResponse.json(
        { error: "`prompt`, `chatId`, `sceneNumber`, and `userId` are required" },
        { status: 400 }
      );
    }

    const bucket = "user_uploads";
    await ensureBucket(bucket);

    const fileName = `${sceneNumber}_${Date.now()}.png`;
    const filePath = `${userId}/${chatId}/${fileName}`;

    if (!force) {
      const { data: existing, error: listErr } = await supabase
        .storage.from(bucket)
        .list(`${userId}/${chatId}`);

      if (!listErr && existing?.some(f => f.name === fileName)) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return NextResponse.json({ imageUrl: urlData.publicUrl });
      }
    }

    const aiResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
      quality: 'low'
    });

    const b64 = aiResp.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "No image data returned from OpenAI" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(b64, "base64");

    const { error: uploadError } = await supabase
      .storage
      .from(bucket)
      .upload(filePath, buffer, {
        upsert: true,
        contentType: "image/png"
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return NextResponse.json({ imageUrl: publicData.publicUrl });
  } catch (err: any) {
    console.error("genImage error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}