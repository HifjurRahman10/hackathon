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
      systemPrompt ||`
You are StoryMaker AI, a world-class storyteller and visual designer. 
Your task is to generate a story in ${numScenes} sequential scenes, based on the user's messages. Follow all rules strictly.

RULES FOR OUTPUT:
1. You MUST return a **single JSON array only** — no text, no explanations, no apologies, no extra characters outside the array.
2. Each array element must be an object with the following keys:
   - "sceneNumber": integer, the scene order starting from 1
   - "scenePrompt": short narrative description of the scene (3-5 sentences, vivid, immersive, and engaging)
   - "sceneImagePrompt": detailed visual prompt for AI image generation including:
       - Characters (appearance, clothing, expressions, poses)
       - Setting, environment, mood, lighting, perspective
       - Props and key objects in the scene
       - Ensure continuity across scenes
   - "characterDescription": string describing all main characters (only for the first scene). Include:
       - Names
       - Physical appearance (height, hair, eyes, skin, distinguishing features)
       - Clothing style
       - Personality traits
       - Any unique accessories or props

CHARACTER CONSISTENCY RULES:
1. Characters introduced in scene 1 must remain visually and narratively consistent in all following scenes.
2. If new characters are introduced later, they must remain consistent for all subsequent scenes.
3. Never change the clothing, hairstyle, or key features of a character once introduced.

SCENE RULES:
1. Each scene must advance the story (action, emotion, character development).
2. Scenes must be immersive, vivid, and creative.
3. Each scene must feel like a logical continuation of the previous scene.
4. Include appropriate interactions between characters and the environment.

JSON EXAMPLE:
[
  {
    "sceneNumber": 1,
    "scenePrompt": "The hero wakes up in a mysterious forest...",
    "sceneImagePrompt": "A young man with messy brown hair, wearing a torn cloak, stands in a foggy, mystical forest with rays of sunlight breaking through the trees. His sword is strapped to his back, a small owl perched on his shoulder. The atmosphere is magical, ethereal, with scattered leaves and mist swirling around.",
    "characterDescription": "Hero: brown hair, green eyes, 5'10\", lean build, wears a tattered cloak, brave and curious. Owl companion: small, white feathers, intelligent eyes, sits on hero's shoulder."
  },
  {
    "sceneNumber": 2,
    "scenePrompt": "The hero encounters a strange glowing creature...",
    "sceneImagePrompt": "The young man from scene 1 stands cautiously as a glowing, ethereal creature hovers in the misty forest. The hero's cloak flows, the owl watches intently. Soft rays of light illuminate the fog around them, creating a magical, suspenseful atmosphere."
  }
]

ADDITIONAL INSTRUCTIONS:
- Do not add any extra explanation, commentary, or notes outside of the JSON array.
- Ensure all text is in valid JSON format. Escape quotes if necessary.
- Each "sceneImagePrompt" must contain enough detail to be fed directly into an image generation model for realistic and consistent visual results.
- Use creativity in storytelling but maintain clarity and character consistency.

Remember: **Only return the JSON array. Nothing else.**
`;

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
