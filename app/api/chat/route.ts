// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

let openApiKey = process.env.OPENAI_API_KEY;

// Zod schema for a single scene
const SceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  scenePrompt: z.string(),
  sceneImagePrompt: z.string(),
});

export async function POST(req: Request) {
  try {
    let body;

    // Parse request body
    try {
      body = await req.json();
    } catch (err) {
      console.error("❌ Failed to parse JSON body:", err);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { messages, systemPrompt, options } = body || {};
    if (!messages || !Array.isArray(messages)) {
      console.error("❌ Missing or invalid `messages`:", messages);
      return NextResponse.json(
        { error: "`messages` must be provided as an array" },
        { status: 400 }
      );
    }

    // Add system prompt + options
    const fullMessages = [
      {
        role: "system",
        content:
          systemPrompt ||
          `You are StoryMaker AI, a master storyteller and visual designer. Your task is to create one captivating scene from a story. The scene must:

1. Advance the story — introduce action, emotion, or character development.
2. Engage the reader — vivid and immersive storytelling.
3. Provide two outputs:
   - A short narrative description of the scene.
   - An expanded image prompt suitable for AI image generation.

Output the result in the following JSON format:

{
  "sceneNumber": 1,
  "scenePrompt": "Short description of the scene (2-3 sentences, narrative focused).",
  "sceneImagePrompt": "Expanded visual description of the scene for image generation (characters, setting, mood, lighting, key details)."
}

Guidelines:
- Keep the scene focused and self-contained.
- Include vivid details about characters, setting, mood, and actions.
- The image prompt should be rich and descriptive, capturing key visual elements for generation.`,
      },
      {
        role: "system",
        content: options
          ? `User options to respect: ${JSON.stringify(options)}`
          : "No extra options provided.",
      },
      ...messages,
    ];

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini", // change model if needed
          messages: fullMessages,
          response_format: { type: "json" },
        }),
      });
    } catch (err) {
      console.error("❌ Network error calling OpenAI API:", err);
      return NextResponse.json(
        { error: "Failed to reach OpenAI API" },
        { status: 502 }
      );
    }

    // Handle OpenAI error responses
    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: await response.text() } };
      }

      console.error("❌ OpenAI API error:", response.status, errorData);

      const safeErrorMessage =
        errorData?.error?.message ||
        (response.status === 429
          ? "Rate limit exceeded. Please try again later."
          : response.status === 401
          ? "Unauthorized. Check API key."
          : response.status === 400
          ? "Invalid request to OpenAI API."
          : response.status >= 500
          ? "OpenAI server error. Please try again later."
          : "Unexpected error from OpenAI API.");

      return NextResponse.json(
        { error: safeErrorMessage },
        { status: response.status }
      );
    }

    // Parse success response
    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error("❌ Failed to parse OpenAI API response:", err);
      return NextResponse.json(
        { error: "Invalid JSON from OpenAI API" },
        { status: 502 }
      );
    }

    // Extract + validate structured JSON
    let structured;
    try {
      const content = data.choices?.[0]?.message?.content;
      structured = SceneSchema.parse(JSON.parse(content));
    } catch (err: any) {
      console.error("❌ Failed to validate structured output:", err);
      return NextResponse.json(
        { error: "OpenAI did not return valid scene JSON" },
        { status: 502 }
      );
    }

    return NextResponse.json({ scene: structured });
  } catch (err) {
    console.error("❌ Unexpected server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
