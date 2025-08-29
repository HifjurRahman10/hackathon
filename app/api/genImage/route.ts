import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "A valid prompt is required" },
        { status: 400 }
      );
    }

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
      quality:"medium",
    });

    const imageUrl = result.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image generation failed, no image returned" },
        { status: 502 }
      );
    }

    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    console.error("Image generation error:", error);

    // Handle known OpenAI API errors
    if (error.response) {
      return NextResponse.json(
        {
          error: error.response.data?.error?.message || "OpenAI API error",
        },
        { status: error.response.status || 502 }
      );
    }

    // Fallback for unexpected errors
    return NextResponse.json(
      { error: error.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}

