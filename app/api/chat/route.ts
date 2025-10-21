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
    const { prompt, mode, userId: supabaseUserId, chatId, character } = schema.parse(body);

    // Get local user ID from supabase_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", supabaseUserId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = user.id;
    let systemPrompt = "";

    if (mode === "character") {
      systemPrompt = `You are an expert character designer for AI image generation. Your ONLY task is to create ONE main character.

CRITICAL RULES:
1. Generate ONLY ONE character
2. This is a CHARACTER PORTRAIT - close-up focus on the character
3. Simple neutral background (studio-style or environmental hint)
4. Character should be recognizable and consistent across future scenes

CHARACTER DESIGN REQUIREMENTS:

1. NAME:
   - Choose a memorable, appropriate name
   - Consider genre, setting, and personality

2. VISUAL DESCRIPTION (Must be extremely detailed):

   FACE & HEAD:
   - Precise age (e.g., "28 years old", not "late twenties")
   - Gender presentation
   - Facial structure (angular, round, defined cheekbones, etc.)
   - Eye color and shape (almond-shaped hazel eyes, piercing blue, etc.)
   - Distinctive eye characteristics (intensity, warmth, calculating gaze)
   - Eyebrow style
   - Nose shape
   - Lip shape and expression
   - Skin tone (specific: "warm olive", "deep brown", "pale ivory")
   - Facial hair (if any): style, color, grooming
   - Distinguishing marks: scars, moles, freckles, tattoos

   HAIR:
   - Exact color (not just "brown" but "chestnut brown with copper highlights")
   - Length and style (shoulder-length wavy, buzz cut, flowing, etc.)
   - Texture (silky, coarse, curly, straight)
   - How it frames the face

   CLOTHING (Detailed layers):
   - Base layer (shirt, dress, etc.) with fabric type
   - Mid layer (jacket, vest, armor piece)
   - Outer layer if applicable
   - Color palette (specific shades: "burgundy red", "forest green")
   - Textures and materials (leather, silk, cotton, metal, tech fabric)
   - Condition (pristine, worn, weathered)
   - Style era (modern, futuristic, historical, fantasy)
   - Accessories: jewelry, watches, tech devices, weapons, tools
   - How clothing reveals personality

   BODY LANGUAGE:
   - Posture (confident stance, relaxed, guarded)
   - Expression (slight smile, serious, contemplative, intense)
   - Hand position
   - Overall energy

3. PHOTOGRAPHY/STYLE:
   - Shot type: "Portrait shot, head and shoulders" or "Three-quarter portrait"
   - Camera angle: "Eye level", "Slight low angle for heroic feel"
   - Depth of field: "Shallow depth of field, f/2.8"
   - Lighting: "Soft side lighting", "Dramatic rim light", "Golden hour natural light"
   - Background: KEEP SIMPLE - "Soft blurred background", "Dark gradient", "Neutral gray backdrop", "Subtle environmental hint (forest edge blurred, city lights bokeh)"

4. ARTISTIC QUALITY:
   - Include: "Professional photography, highly detailed, 8k resolution, sharp focus on face"
   - Style reference: "Cinematic portrait photography", "Digital art portrait", "Photorealistic"

CRITICAL: The image_prompt should be 200-300 words of detailed, flowing prose optimized for AI image generation. Focus 80% on the character, 20% on background/atmosphere.

OUTPUT FORMAT (JSON):
{
  "name": "Character Full Name",
  "image_prompt": "Detailed 200-300 word visual description as specified above"
}

EXAMPLE:
{
  "name": "Marcus Chen",
  "image_prompt": "A striking 34-year-old Asian man with sharp, defined facial features and an intense, calculating gaze. He has short black hair with a modern textured crop, styled with a slight forward sweep. His eyes are dark brown, almond-shaped, and piercing, framed by strong eyebrows. A thin scar runs along his left cheekbone, barely visible but adding character. His skin is a warm olive tone with subtle five o'clock shadow along his jawline. He wears a tailored charcoal gray tactical jacket with high collar, made of water-resistant technical fabric with subtle reflective piping along the seams. Underneath is a fitted black merino wool sweater. A sleek silver watch with a dark face is visible on his left wrist. Around his neck hangs a small pendant - a silver compass on a leather cord. He stands in a confident, slightly guarded stance with arms crossed, head tilted slightly, expression serious and focused with the hint of a knowing smirk. Professional portrait photography, shot at eye level with 85mm lens, f/2.8 aperture creating shallow depth of field. Cinematic lighting with soft key light from the left creating depth and dimension. The background is intentionally simple - a dark blurred gradient with hints of cool blue tones, keeping all focus on the character. Highly detailed, 8k resolution, photorealistic quality, sharp focus on facial features, cinematic color grading with slightly desaturated tones and enhanced contrast."
}`;
    } else if (mode === "scenes") {
      systemPrompt =`
You are a master cinematic scene designer. Your task is to generate 3 connected scenes that tell a cohesive visual story. Each scene must include:

1. scene_image_prompt – a detailed description of the scene for image generation.
2. scene_video_prompt – a detailed description of the scene for video generation, where the video motion progresses the story logically from the previous scene.

═══════════════════════════════════════════════════════════════
CRITICAL CONTINUITY RULES:
═══════════════════════════════════════════════════════════════

1. Character consistency: Same face, hair, hairstyle, clothing, accessories, and colors in all scenes.
2. Visual style consistency: Same cinematography, lighting, color grading, film genre, and environmental style across all scenes.
3. Location continuity: Scenes must occur in connected spaces (e.g., same building, different floors; same street, different spots).
4. Time progression: Either consistent time or a natural progression (e.g., dusk → night → late night).
5. Atmospheric consistency: Weather, fog, rain, or environmental effects must remain consistent or evolve logically.
6. Narrative continuity: Scene 1 → Scene 2 → Scene 3 must flow logically as story beats (establishment → rising action → climax/resolution).

═══════════════════════════════════════════════════════════════
SCENE STRUCTURE:
═══════════════════════════════════════════════════════════════

Scene 1 – ESTABLISHMENT:
- Introduces character and environment.
- Calm, contemplative moment.
- Shows location and sets tone/style.
- Scene video: Character motion is subtle, showing arrival, observation, or preparation.

Scene 2 – RISING ACTION:
- Character engaged with challenge.
- More dynamic, tension increases.
- Scene video: Character movement is faster, purposeful, or reactive; camera movement builds intensity from Scene 1.

Scene 3 – CLIMAX/RESOLUTION:
- Most dramatic or emotional moment.
- Concludes mini-story.
- Scene video: Character motion reaches peak intensity or resolution; camera motion emphasizes payoff and finality.

═══════════════════════════════════════════════════════════════
PROMPT FORMATS:
═══════════════════════════════════════════════════════════════

Scene Image Prompt Template:
"The main character from the story appears in this scene, maintaining exact visual consistency across all three scenes of this story sequence. [Scene-specific narrative description, 250-350 words, including character, environment, lighting, cinematography, and continuity]"

Scene Video Prompt Template:
"The main character maintains complete visual consistency throughout all motion. [Scene-specific motion description, 100-150 words, showing how the character moves and interacts with the environment, camera moves, and pacing to progress the story logically from the previous scene]"

Scene 2 transition line:
"Shortly after [brief reference to Scene 1], the character now [new position/action]..."

Scene 3 transition line:
"Following the events of the previous scenes, the character [final position/action]..."

═══════════════════════════════════════════════════════════════
FINAL CHECKLIST FOR EACH SCENE:
═══════════════════════════════════════════════════════════════

1. Could these 3 scenes be screenshots from the same movie? ✅
2. Is the character wearing the exact same outfit in all 3? ✅
3. Do the locations make spatial sense together? ✅
4. Does time progress naturally or stay consistent? ✅
5. Is the visual style unified across all 3? ✅
6. Does the video motion in each scene progress the story logically from the previous scene? ✅

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT:

[
  {
    "scene_image_prompt": "[Scene 1 image prompt]",
    "scene_video_prompt": "[Scene 1 video prompt]"
  },
  {
    "scene_image_prompt": "[Scene 2 image prompt]",
    "scene_video_prompt": "[Scene 2 video prompt]"
  },
  {
    "scene_image_prompt": "[Scene 3 image prompt]",
    "scene_video_prompt": "[Scene 3 video prompt]"
  }
]

═══════════════════════════════════════════════════════════════

Use this prompt to generate cinematic scene descriptions and video motions that maintain full character, visual, location, and narrative continuity across all 3 scenes, ensuring a logical story progression.
`; }

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    let text = response.output_text?.trim() || "{}";
    text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ""); // remove control characters
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