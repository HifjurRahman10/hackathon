// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Supabase client (service key)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Schema for a scene
const SceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  scenePrompt: z.string(),
  sceneImagePrompt: z.string(),
  characterDescription: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null)
    if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    // ADD userId and systemPrompt so they exist (minimal change)
    let { chatId, messages, numScenes, userId, systemPrompt } = raw
    // Accept string or number without changing downstream logic
    if (typeof chatId === 'string') {
      const n = Number(chatId)
      if (!Number.isNaN(n)) chatId = n
    }
    if (typeof chatId !== 'number' || !Number.isFinite(chatId) || chatId <= 0) {
      return NextResponse.json({ error: '`chatId` is required' }, { status: 400 })
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "`messages` must be an array" }, { status: 400 });
    }
    if (!numScenes || typeof numScenes !== "number" || numScenes < 1) {
      return NextResponse.json({ error: "`numScenes` must be a positive number" }, { status: 400 });
    }

    // --- Verify that chat belongs to user ---
    const { data: chatOwner } = await supabase
      .from("chats")
      .select("user_id")
      .eq("id", chatId)
      .single();

    if (!chatOwner || chatOwner.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized: chat does not belong to user" }, { status: 403 });
    }

    const systemContent = systemPrompt || `You are StoryMaker AI, a master storyteller and visual designer.
Your task is to create a full-length story divided into ${numScenes} sequential scenes based on the user's prompt.

Rules for Character Consistency:
1. Characters should be invented naturally in the first scene.
2. For the first scene, include a detailed "characterDescription" for every character introduced. Describe their appearance, clothing, distinctive traits, and any notable features.
3. For all subsequent scenes, inject the "characterDescription" from the first scene into each sceneImagePrompt to ensure all characters remain visually consistent.
4. Characters must not change appearance, clothing style, or key features across scenes.
5. New characters can be introduced later, but once introduced, they must remain consistent as well.

Scene Requirements:
1. Each scene must advance the story — action, emotion, and character development.
2. Each scene must engage the reader — vivid, immersive storytelling.
3. Each scene must include:
   - "scenePrompt": A short narrative description of the scene.
   - "sceneImagePrompt": An expanded visual description suitable for AI image generation.
     - Include character descriptions for consistency (use the characterDescription from previous scenes).
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
]`;

    const fullInput = [
      { role: "system", content: systemContent },
      ...messages,
    ];

    // --- Call OpenAI ---
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

    // --- Store scenes in Supabase ---
    for (const scene of scenes) {
      await supabase
        .from("scenes")
        .insert({
          chat_id: chatId,
          scene_number: scene.sceneNumber,
          scene_prompt: scene.scenePrompt,
          scene_image_prompt: scene.sceneImagePrompt,
          character_description: scene.characterDescription || null,
        });
    }

    // --- Return system prompt and scenes ---
    return NextResponse.json({ systemPrompt: systemContent, scenes });
  } catch (err: any) {
    console.error("❌ Chat route error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
