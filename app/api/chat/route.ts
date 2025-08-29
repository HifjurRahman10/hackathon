// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

const openApiKey = process.env.OPENAI_API_KEY;

// Zod schema for a single scene
const SceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  scenePrompt: z.string(),
  sceneImagePrompt: z.string(),
});

export async function POST(req: Request) {
  try {
    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { messages, systemPrompt, options } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "`messages` must be an array" }, { status: 400 });
    }

    // Build full messages array for OpenAI
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
        content: options ? `User options: ${JSON.stringify(options)}` : "No extra options.",
      },
      ...messages,
    ];

    // Call OpenAI API
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: fullMessages,
          response_format: { type: "text" }, // we parse JSON manually
        }),
      });
    } catch (err) {
      console.error("❌ Network error calling OpenAI API:", err);
      return NextResponse.json({ error: "Failed to reach OpenAI API" }, { status: 502 });
    }

    // Handle API errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || "OpenAI API error";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    // Parse OpenAI response
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent || typeof rawContent !== "string") {
      return NextResponse.json({ error: "No content returned from OpenAI" }, { status: 502 });
    }

    // Parse JSON and validate with Zod
    let scene;
    try {
      scene = SceneSchema.parse(JSON.parse(rawContent));
    } catch (err) {
      console.error("❌ Failed to parse or validate scene:", err, rawContent);
      return NextResponse.json(
        { error: "OpenAI did not return valid scene JSON" },
        { status: 502 }
      );
    }

    return NextResponse.json({ scene });
  } catch (err: any) {
    console.error("❌ Unexpected server error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
