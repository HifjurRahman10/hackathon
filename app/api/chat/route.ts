import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const schema = z.object({
  prompt: z.string(),
  userId: z.string(),
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
    const { prompt, mode, userId, character } = schema.parse(body);

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
The image_prompt should vividly describe the character's visual appearance, clothing, and vibe.
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

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
