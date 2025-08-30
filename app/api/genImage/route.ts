import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, sceneNumber, chatId } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "`prompt` is required" }, { status: 400 });
    }

    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    });

    const imgData = image.data?.[0];
    let imageUrl: string | null = imgData?.url || (imgData?.b64_json ? `data:image/png;base64,${imgData.b64_json}` : null);

    if (!imageUrl) return NextResponse.json({ error: "No image returned" }, { status: 502 });

    // --- Upload base64 image to Supabase ---
    if (imgData?.b64_json) {
      const buffer = Buffer.from(imgData.b64_json, "base64");
      const fileName = `scene_${chatId}_${sceneNumber}_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("user_uploads")
        .upload(fileName, buffer, { contentType: "image/png", upsert: true });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data } = supabase.storage.from("user_uploads").getPublicUrl(fileName);
      imageUrl = data.publicUrl;
    }

    return NextResponse.json({ imageUrl });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
