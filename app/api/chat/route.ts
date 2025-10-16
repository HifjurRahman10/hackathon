import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const schema = z.object({
  prompt: z.string(),
  userId: z.string(),
  chatId: z.string(),
  mode: z.enum(["character", "scenes"]),
  character: z
    .object({
      name: z.string().optional(),
      image_prompt: z.string().optional(),
      image_url: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, mode, userId, chatId, character } = schema.parse(body);

    let systemPrompt = "";

    if (mode === "character") {
      systemPrompt = `
You are a creative assistant generating unique character concepts.
Generate one main character from the user's input.
Output only valid JSON:
{
  "name": "string",
  "image_prompt": "string"
}
The image_prompt should vividly describe the character's visual appearance, clothing, and vibe add as much detail as possible.
`;
    } else if (mode === "scenes") {
      systemPrompt = `
You are a cinematic story designer.
Generate exactly 3 scenes based on the user’s prompt.

Each scene should:
1. Feature the same main character (referenced by an image that will be provided later to the image model).
2. Include a field "scene_image_prompt" that visually describes the scene and explicitly says:
   "Include the main character from the provided character image in this scene."
3. Include a field "scene_video_prompt" describing what happens in motion.

Return only valid JSON:
[
  {
    "scene_image_prompt": "string",
    "scene_video_prompt": "string"
  },
  ...
]
`;
    }

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const text = response.output_text?.trim() || "{}";
    const data = JSON.parse(text);

    // Save user message
    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: userId,
      content: prompt,
      role: "user",
    });

    // Save assistant response
    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: userId,
      content: text,
      role: "assistant",
    });

    // Save character to database
    if (mode === "character" && data.name && data.image_prompt) {
      const { data: charData, error: charError } = await supabase
        .from("characters")
        .insert({
          chat_id: chatId,
          character_name: data.name,
          character_image_prompt: data.image_prompt,
        })
        .select()
        .single();

      if (!charError && charData) {
        data.id = charData.id;
      }
    }

    // Save scenes to database
    if (mode === "scenes" && Array.isArray(data)) {
      const scenesWithIds = await Promise.all(
        data.map(async (scene, index) => {
          const { data: sceneData, error: sceneError } = await supabase
            .from("scenes")
            .insert({
              chat_id: chatId,
              scene_number: index + 1,
              scene_image_prompt: scene.scene_image_prompt,
              scene_video_prompt: scene.scene_video_prompt,
            })
            .select()
            .single();

          return sceneError ? scene : { ...scene, id: sceneData.id };
        })
      );
      return NextResponse.json({ data: scenesWithIds });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
