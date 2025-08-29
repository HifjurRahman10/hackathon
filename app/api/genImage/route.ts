// app/api/genImage/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    // ✅ Parse body safely
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { prompt } = body;

    // ✅ Validate input
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "`prompt` is required and must be a string" },
        { status: 400 }
      );
    }

    // ✅ Call OpenAI Image API (hardcoded size + n=1)
    let image;
    try {
      image = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024", // hardcoded
        n: 1,              // hardcoded
        response_format: "url", // 👈 force URL return
      });
    } catch (apiErr: any) {
      console.error("❌ OpenAI API error:", apiErr);
      return NextResponse.json(
        {
          error:
            apiErr.error?.message ||
            apiErr.message ||
            "Failed to generate image",
        },
        { status: apiErr.status || 502 }
      );
    }

    const imgData = image.data?.[0];

    // ✅ Handle both cases: URL or Base64
    let imageUrl: string | null = null;
    if (imgData?.url) {
      imageUrl = imgData.url;
    } else if (imgData?.b64_json) {
      imageUrl = `data:image/png;base64,${imgData.b64_json}`;
    }

    if (!imageUrl) {
      console.error("❌ OpenAI returned no usable image:", image);
      return NextResponse.json(
        { error: "No image returned from OpenAI" },
        { status: 502 }
      );
    }

    // ✅ Success
    return NextResponse.json({ imageUrl });
  } catch (err: any) {
    console.error("❌ Unexpected server error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
