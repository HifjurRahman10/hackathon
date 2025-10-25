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
    const { prompt, mode, userId: supabaseUserId, chatId } = schema.parse(body);

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", supabaseUserId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

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
     systemPrompt = "You are a MASTER CINEMATIC SCENE DESIGNER. Generate six connected scenes forming a continuous cinematic story. Output MUST be valid JSON: an array of six objects, each with 'scene_image_prompt' and 'scene_video_prompt'. No text outside JSON. \
scene_image_prompt: Describe one visually dynamic film frame showing the SAME main character with consistent appearance, lighting style, and film tone across all six scenes. Each scene must differ in angle, framing, emotion, environment, and lighting mood (e.g., wide establishing, medium conflict, close emotional, overhead, side silhouette, backlit finale). Each image must feel cinematic and unique, not repetitive. \
scene_video_prompt: Describe dynamic camera motion and editing for that same scene — include pans, zooms, tilts, dolly moves, tracking, and expressive camera cuts. Mention how motion builds emotion and connects to previous or next scene. The camera should feel alive, energetic, and cinematic. \
Scene order and flow: 1 Establishment → 2 Inciting Action → 3 Rising Action → 4 Climax → 5 Falling Action → 6 Resolution. All scenes must connect logically in space, time, and tone. \
Return ONLY valid JSON like: [ { 'scene_image_prompt': '...', 'scene_video_prompt': '...' }, ... six total ]. No markdown, commentary, or notes. Each scene must be concise, cinematic, emotionally vivid, visually distinct, and production-ready.";
;

    }

    async function getParsedResponse(): Promise<any> {
      const response = await openai.responses.create({
        model: "gpt-5",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      });

      let text = response.output_text?.trim() || "{}";
      text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

      try {
        return JSON.parse(text);
      } catch {
        const retryResponse = await openai.responses.create({
          model: "gpt-5",
          input: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                prompt +
                "\nReturn only valid JSON following the required format.",
            },
          ],
        });
        let retryText = retryResponse.output_text?.trim() || "{}";
        retryText = retryText.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
        return JSON.parse(retryText);
      }
    }

    const data = await getParsedResponse();

    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: userId,
      content: prompt,
      role: "user",
    });

    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: userId,
      content: JSON.stringify(data),
      role: "assistant",
    });

    if (mode === "character" && data.name && data.image_prompt) {
      const { data: charData } = await supabase
        .from("characters")
        .insert({
          chat_id: chatId,
          character_name: data.name,
          character_image_prompt: data.image_prompt,
        })
        .select()
        .single();
      if (charData) data.id = charData.id;
    }

    if (mode === "scenes" && Array.isArray(data)) {
      const scenesWithIds = await Promise.all(
        data.map(async (scene, index) => {
          const { data: sceneData } = await supabase
            .from("scenes")
            .insert({
              chat_id: chatId,
              scene_number: index + 1,
              scene_image_prompt: scene.scene_image_prompt,
              scene_video_prompt: scene.scene_video_prompt,
            })
            .select()
            .single();
          return { ...scene, id: sceneData?.id };
        })
      );
      return NextResponse.json({ data: scenesWithIds });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
