// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
    const raw = await req.json().catch((e) => {
      console.error("JSON parse error:", e);
      return null;
    });

    if (!raw) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    let { chatId, messages, numScenes, systemPrompt } = raw as any;

    if (typeof chatId === "number") chatId = chatId.toString();
    if (!chatId?.trim()) {
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

    if (chatErr || !chatOwner) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    // Detailed system prompt
    const detailedSystemPrompt =
      systemPrompt || process.env.SYSTEM_PROMPT;
    // Combine user messages
    const combinedUserMessages = parsedMessages.data
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    // Responses API call
    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: detailedSystemPrompt },
        { role: "user", content: combinedUserMessages },
      ],
    });

    const rawOutput = response.output_text;
    if (!rawOutput) return NextResponse.json({ error: "No output from OpenAI" }, { status: 502 });

    let scenes;
    try {
      scenes = z.array(SceneSchema).parse(JSON.parse(rawOutput.trim()));
    } catch (err) {
      console.error("Parsing scenes failed:", err, "raw:", rawOutput);
      return NextResponse.json({ error: "Invalid JSON from OpenAI", details: rawOutput }, { status: 502 });
    }

    // Insert scenes into Supabase
    for (const scene of scenes) {
      const { error: insertError } = await supabase.from("scenes").insert({
        chat_id: chatId,
        scene_number: scene.sceneNumber,
        scene_prompt: scene.scenePrompt,
        scene_image_prompt: scene.sceneImagePrompt,
        character_description: scene.characterDescription ?? null,
      });
      if (insertError) console.error("Error inserting scene:", insertError);
    }

    return NextResponse.json({ systemPrompt: detailedSystemPrompt, scenes });
  } catch (err: any) {
    console.error("Chat route error:", err);
    return NextResponse.json({ error: err.message || "Internal server error", details: err.stack }, { status: 500 });
  }
}
