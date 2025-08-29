import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "`prompt` is required" }, { status: 400 });
    }

    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality:'medium',
      n: 1,
    });

    const imgData = image.data?.[0];
    let imageUrl: string | null = imgData?.url || (imgData?.b64_json ? `data:image/png;base64,${imgData.b64_json}` : null);

    if (!imageUrl) return NextResponse.json({ error: "No image returned" }, { status: 502 });

    return NextResponse.json({ imageUrl });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
