// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Schema for a scene
const SceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  scenePrompt: z.string(),
  sceneImagePrompt: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { messages, systemPrompt, numScenes } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "`messages` must be an array" }, { status: 400 });
    }
    if (!numScenes || typeof numScenes !== "number" || numScenes < 1) {
      return NextResponse.json({ error: "`numScenes` must be a positive number" }, { status: 400 });
    }

    // System prompt updated for multi-scene story
    const systemContent = systemPrompt || `You are StoryMaker AI, a master storyteller and visual designer.
Your task is to create a full-length story divided into ${numScenes} sequential scenes based on the user's prompt.
Each scene must:
1. Advance the story — action, emotion, character development.
2. Engage the reader — vivid and immersive storytelling.
3. Provide two outputs:
   - A short narrative description of the scene.
   - An expanded image prompt suitable for AI image generation.

Output the result in the following JSON array format:

[
  {
    "sceneNumber": 1,
    "scenePrompt": "Short narrative for scene 1",
    "sceneImagePrompt": "Expanded visual description for AI image generation"
  },
  {
    "sceneNumber": 2,
    "scenePrompt": "Short narrative for scene 2",
    "sceneImagePrompt": "Expanded visual description for AI image generation"
  },
  ...
  {
    "sceneNumber": ${numScenes},
    "scenePrompt": "Short narrative for scene ${numScenes}",
    "sceneImagePrompt": "Expanded visual description for AI image generation"
  }
]

Guidelines:
- Keep each scene self-contained.
- Include vivid details about characters, setting, mood, actions.
- Image prompts should capture key visual elements for AI generation.
`;

    const fullInput = [
      { role: "system", content: systemContent },
      ...messages,
    ];

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: fullInput,
    });

    const rawContent = response.output_text;
    if (!rawContent) return NextResponse.json({ error: "No content from OpenAI" }, { status: 502 });

    let scenes;
    try {
      scenes = z.array(SceneSchema).parse(JSON.parse(rawContent.trim()));
    } catch (err) {
      console.error("❌ Failed to parse scenes:", err, "raw:", rawContent);
      return NextResponse.json({ error: "Invalid scene JSON from OpenAI" }, { status: 502 });
    }

    return NextResponse.json({ scenes });
  } catch (err: any) {
    console.error("❌ Chat route error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
