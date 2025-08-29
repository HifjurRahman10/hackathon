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

Rules for Character Consistency:
1. Characters should be invented naturally in the first scene.
2. For the first scene, include a detailed "characterDescription" for every character introduced. Describe their appearance, clothing, distinctive traits, and any notable features.
3. For all subsequent scenes, **inject the "characterDescription" from the first scene into each sceneImagePrompt** to ensure all characters remain visually consistent.
4. Characters must not change appearance, clothing style, or key features across scenes.
5. New characters can be introduced later, but once introduced, they must remain consistent as well.

Scene Requirements:
1. Each scene must advance the story — action, emotion, and character development.
2. Each scene must engage the reader — vivid, immersive storytelling.
3. Each scene must include:
   - "scenePrompt": A short narrative description of the scene.
   - "sceneImagePrompt": An expanded visual description suitable for AI image generation.
     - **Include character descriptions for consistency** (use the characterDescription from previous scenes).
     - Ensure visual continuity in lighting, perspective, setting, props, and mood.
   - "characterDescription": Only for the first scene, listing all main characters.

Output Format (JSON Array):
[
  {
    "sceneNumber": 1,
    "scenePrompt": "Short narrative for scene 1",
    "sceneImagePrompt": "Expanded visual description for AI image generation, include characters naturally",
    "characterDescription": "Detailed descriptions of all characters introduced in this scene"
  },
  {
    "sceneNumber": 2,
    "scenePrompt": "Short narrative for scene 2",
    "sceneImagePrompt": "Expanded visual description for AI image generation, include characters as per characterDescription from scene 1"
  },
  ...
  {
    "sceneNumber": ${numScenes},
    "scenePrompt": "Short narrative for scene ${numScenes}",
    "sceneImagePrompt": "Expanded visual description for AI image generation, maintain character consistency with characterDescription from scene 1"
  }
]

Additional Guidelines:
- Keep each scene self-contained but maintain narrative and visual continuity.
- Include vivid details about characters, setting, mood, and actions.
- Do not generate random variations in characters’ appearance between scenes.
- Reference previous scene visuals or character descriptions to maintain style continuity.
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
