import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminSupabase } from '@/lib/auth/supabase';
const supabase = createAdminSupabase();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, sceneNumber, chatId } = body;

    if (!prompt || !chatId) {
      return NextResponse.json({ error: "prompt and chatId required" }, { status: 400 });
    }

    // FIXED: Use correct DALL-E model
    const image = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      n: 1
    });

    const imgData = image.data?.[0];
    if (!imgData?.url) { // FIXED: DALL-E returns 'url', not 'b64_json'
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    // FIXED: Fetch the image from the URL and convert to buffer
    const response = await fetch(imgData.url);
    const buffer = Buffer.from(await response.arrayBuffer());

    const fileName = `scene_${chatId}_${sceneNumber}_${Date.now()}.png`;

    const { error: upError } = await supabase.storage
      .from("user_uploads")
      .upload(fileName, buffer, { contentType: "image/png" });

    if (upError) {
      return NextResponse.json({ error: upError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("user_uploads").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    // Update scene record with image URL
    await supabase.from("scenes")
      .update({ image_url: publicUrl })
      .eq("chat_id", chatId)
      .eq("scene_number", sceneNumber);

    return NextResponse.json({ imageUrl: publicUrl });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
