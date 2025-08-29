import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, numScenes } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "`prompt` must be provided" }, { status: 400 });
    }

    // Call OpenAI to generate multiple scenes
    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: [
        {
          role: "system",
          content: `You are StoryMaker AI, a master storyteller and visual designer.
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
`,
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = response.output_text;
    let scenes = [];
    try {
      scenes = JSON.parse(raw.trim());
    } catch (err) {
      console.error("Failed to parse JSON from OpenAI:", raw);
      return NextResponse.json({ error: "Failed to parse scenes" }, { status: 502 });
    }

    return NextResponse.json({ scenes });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
