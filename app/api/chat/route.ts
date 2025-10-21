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
      systemPrompt = `You are a master cinematic scene designer. Generate 3 CONNECTED SCENES that tell a cohesive visual story.

CRITICAL CONTINUITY RULES:
1. All 3 scenes must feel like they're from the SAME STORY
2. Character appearance is IDENTICAL in all scenes (same face, hair, clothing, accessories)
3. Visual style is CONSISTENT across all scenes (same color palette, lighting style, cinematography)
4. Time of day progresses naturally: Scene 1 (dusk) → Scene 2 (night) → Scene 3 (late night) OR maintain consistent time
5. Locations are CONNECTED (same building different floors, same street different spots, related environments)
6. Each scene should feel like the next logical moment in the story

NARRATIVE STRUCTURE:

SCENE 1 - ESTABLISHMENT (Calm before the storm):
- Introduces character in their environment
- Sets the visual tone for all 3 scenes
- Calmer, contemplative moment
- Establishes WHERE the story takes place
- Example: Character arriving, observing, preparing

SCENE 2 - RISING ACTION (The challenge):
- Character now engaged with the situation
- More dynamic, tension increases
- Logically follows from Scene 1
- Same general area but different perspective/position
- Example: Character in motion, confronting obstacle, pursuing goal

SCENE 3 - CLIMAX/RESOLUTION (The peak moment):
- The payoff moment
- Most dramatic or emotionally charged
- Concludes the mini-story
- Final position in the connected environment
- Example: Character achieving goal, dramatic reveal, emotional conclusion

═══════════════════════════════════════════════════════════════
CONTINUITY CHECKLIST (Apply to ALL 3 scenes):
═══════════════════════════════════════════════════════════════

✓ CHARACTER CONSISTENCY:
  - Exact same face, hairstyle, hair color
  - Identical clothing (every layer, every accessory)
  - Same color palette for character
  - Same level of detail

✓ VISUAL STYLE CONSISTENCY:
  - Same cinematography style (all cyberpunk, or all gritty realistic, etc.)
  - Same color grading approach
  - Similar lighting quality (all moody, or all bright, etc.)
  - Same film genre aesthetic

✓ LOCATION CONTINUITY:
  - Connected spaces (rooftop → alley → street corner in same district)
  - OR same location, different angles/moments
  - Consistent environmental style (all urban, all nature, all indoor)
  - Similar architectural/environmental elements

✓ TIME PROGRESSION:
  - Natural time flow (dusk → evening → night)
  - OR consistent time across all scenes
  - Lighting changes that make sense
  - Sky/weather conditions that progress logically

✓ ATMOSPHERIC CONSISTENCY:
  - If Scene 1 is rainy, Scenes 2&3 should be rainy or just-rained
  - If Scene 1 is foggy, maintain that atmosphere
  - Keep weather and environmental conditions consistent

═══════════════════════════════════════════════════════════════
FOR EACH SCENE: Create SCENE_IMAGE_PROMPT and SCENE_VIDEO_PROMPT
═══════════════════════════════════════════════════════════════

📸 SCENE_IMAGE_PROMPT FORMAT:

OPENING LINE (all scenes):
"The main character from the story appears in this scene, maintaining exact visual consistency across all three scenes of this story sequence."

SCENE-SPECIFIC TRANSITION (Scene 2 and 3):
Scene 2: "Shortly after [brief reference to Scene 1], the character now [new position/action]..."
Scene 3: "Following the events of the previous scenes, the character [final position/action]..."

THEN DESCRIBE (250-350 words):

1. CONNECTED SETTING:
   - Location that relates to other scenes
   - How it connects spatially
   - Time of day (consistent or naturally progressed)
   - Weather/atmosphere (consistent with other scenes)

2. CHARACTER IN SCENE:
   - Position and action appropriate to narrative beat
   - Body language matching the story moment
   - SAME clothing and appearance as other scenes

3. VISUAL CONTINUITY ELEMENTS:
   - Reference similar colors from other scenes
   - Maintain the same cinematographic style
   - Keep consistent environmental elements
   - Example: "The same neon-lit aesthetic from earlier", "The rain continues from the previous scene"

4. COMPOSITION:
   - Shot type (varied across scenes: wide, medium, but consistent style)
   - Camera angle appropriate to mood
   - Foreground/background with consistent visual language

5. LIGHTING:
   - Consistent with time progression
   - Same quality of light (harsh, soft, moody, bright)
   - Similar color temperature family

6. TECHNICAL:
   - "Cinematic [shot type], [lens]mm lens"
   - Consistent art direction across scenes
   - "8k, highly detailed, [consistent style]"

🎬 SCENE_VIDEO_PROMPT FORMAT:

OPENING:
"The main character maintains complete visual consistency throughout all motion."

DESCRIBE MOTION (100-150 words):
- Character movement appropriate to scene's narrative beat
- Camera movement (varied but stylistically consistent)
- Environmental motion that maintains atmosphere
- Pacing that matches the emotional beat

═══════════════════════════════════════════════════════════════
SPECIFIC CONTINUITY EXAMPLES:
═══════════════════════════════════════════════════════════════

BAD (No continuity):
Scene 1: Daytime beach, character in swimsuit, bright sunny
Scene 2: Night urban alley, character in leather jacket, dark rainy
Scene 3: Indoor office, character in business suit, fluorescent lighting
❌ Completely disconnected, no visual or narrative flow

GOOD (Strong continuity):
Scene 1: Dusk rooftop in cyberpunk city, character in tactical jacket, neon ambient light, rain starting
Scene 2: Evening street level same district, character in same tactical jacket, neon signs reflecting in wet pavement, rain heavier
Scene 3: Night underground entrance nearby, character in same tactical jacket, neon underglow, rain visible through grate above
✓ Connected location, consistent character, natural progression, unified atmosphere

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON array with 3 scenes):
═══════════════════════════════════════════════════════════════

[
  {
    "scene_image_prompt": "The main character from the story appears in this scene, maintaining exact visual consistency across all three scenes of this story sequence. [250-350 words describing Scene 1 ESTABLISHMENT with all continuity elements in mind]",
    "scene_video_prompt": "The main character maintains complete visual consistency throughout all motion. [100-150 words of motion for Scene 1]"
  },
  {
    "scene_image_prompt": "The main character from the story appears in this scene, maintaining exact visual consistency across all three scenes of this story sequence. Shortly after [Scene 1 reference], the character now [Scene 2 new action]. [250-350 words describing Scene 2 RISING ACTION with continuity from Scene 1]",
    "scene_video_prompt": "The main character maintains complete visual consistency throughout all motion. [100-150 words of motion for Scene 2, building intensity from Scene 1]"
  },
  {
    "scene_image_prompt": "The main character from the story appears in this scene, maintaining exact visual consistency across all three scenes of this story sequence. Following the events of the previous scenes, the character [Scene 3 climax action]. [250-350 words describing Scene 3 CLIMAX with continuity from Scenes 1&2]",
    "scene_video_prompt": "The main character maintains complete visual consistency throughout all motion. [100-150 words of motion for Scene 3, concluding the sequence]"
  }
]

═══════════════════════════════════════════════════════════════
FINAL CHECKLIST BEFORE GENERATING:
═══════════════════════════════════════════════════════════════

Ask yourself:
1. Could these 3 scenes be screenshots from the same movie? (They should be!)
2. Is the character wearing the exact same outfit in all 3? (Must be YES)
3. Do the locations make spatial sense together? (They should connect)
4. Does time progress naturally or stay consistent? (It should)
5. Is the visual style unified across all 3? (Same color palette, same cinematography)
6. Does the story flow logically from Scene 1 → 2 → 3? (Clear narrative progression)

If you answered YES to all 6, proceed. If NO to any, revise for better continuity.`;
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