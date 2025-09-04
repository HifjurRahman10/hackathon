// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  scenePrompt: z.string(),
  sceneImagePrompt: z.string(),
  characterDescription: z.string().optional(),
});

const MessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    if (!raw) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    let { chatId, messages, numScenes, systemPrompt } = raw as any;

    if (typeof chatId !== "string" || !chatId.trim()) {
      return NextResponse.json({ error: "`chatId` is required" }, { status: 400 });
    }
    chatId = chatId.trim();

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "`messages` must be an array" }, { status: 400 });
    }
    const parsedMessages = z.array(MessageSchema).safeParse(messages);
    if (!parsedMessages.success) {
      return NextResponse.json({ error: "`messages` elements must include { role, content }" }, { status: 400 });
    }

    if (typeof numScenes !== "number" || numScenes < 1) {
      return NextResponse.json({ error: "`numScenes` must be a positive number" }, { status: 400 });
    }

    const { data: chatOwner, error: chatErr } = await supabase
      .from("chats")
      .select("user_id")
      .eq("id", chatId)
      .single();

    if (chatErr || !chatOwner) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Build system prompt
    const finalSystemPrompt = systemPrompt || `
You are StoryMaker AI, a master storyteller and visual designer.
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
    "sceneImagePrompt": "Expanded visual description ...",
    "characterDescription": "Detailed descriptions..."
  },
  { ... }, ..., { "sceneNumber": ${numScenes}, ... }
]`;

    // Combine user messages into a single prompt
    const combinedUserMessages = parsedMessages.data
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const openaiResponse = await openai.responses.create({
      model: "gpt-5-nano",
      instructions: finalSystemPrompt,
      input: combinedUserMessages,
    });

    const rawOutput = openaiResponse.output_text;
    if (!rawOutput) {
      return NextResponse.json({ error: "No output from OpenAI" }, { status: 502 });
    }

    let scenes;
    try {
      scenes = z.array(SceneSchema).parse(JSON.parse(rawOutput.trim()));
    } catch (err) {
      console.error("Parsing scenes failed:", err, "raw:", rawOutput);
      return NextResponse.json({ error: "Invalid JSON from OpenAI" }, { status: 502 });
    }

    for (const scene of scenes) {
      await supabase.from("scenes").insert({
        chat_id: chatId,
        scene_number: scene.sceneNumber,
        scene_prompt: scene.scenePrompt,
        scene_image_prompt: scene.sceneImagePrompt,
        character_description: scene.characterDescription ?? null,
      });
    }

    return NextResponse.json({ systemPrompt: finalSystemPrompt, scenes });
  } catch (err: any) {
    console.error("Chat route error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
