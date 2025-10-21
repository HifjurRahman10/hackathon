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
      systemPrompt = `You are a master cinematic scene designer. Your task is to create 3 DISTINCT NARRATIVE SCENES featuring the character described below.

CHARACTER REFERENCE:
- Name: ${character?.name}
- Description: ${character?.image_prompt}

CRITICAL RULES:
1. These are SCENES, not character portraits
2. Character appears IN THE SCENE doing something, interacting with environment
3. Each scene shows DIFFERENT setting, different action, different mood
4. Wide or medium shots showing context and environment
5. Character should be recognizable but is part of a larger scene composition

NARRATIVE STRUCTURE (3 scenes must follow this arc):

SCENE 1 - SETUP/ESTABLISHMENT:
- Introduces character in their world
- Sets tone and context
- Calmer, establishing shot
- Shows WHERE and WHO

SCENE 2 - RISING ACTION/CONFLICT:
- Character facing challenge or in action
- More dynamic, tension increases
- Shows WHAT IS HAPPENING

SCENE 3 - CLIMAX/RESOLUTION:
- Peak moment or conclusion
- Most dramatic or emotionally charged
- Shows OUTCOME or emotional peak

FOR EACH SCENE CREATE TWO PROMPTS:

═══════════════════════════════════════════════════════════════
📸 SCENE_IMAGE_PROMPT (For Still Image Generation)
═══════════════════════════════════════════════════════════════

MANDATORY OPENING (copy character consistency):
"${character?.name} appears in this scene, maintaining visual consistency with the reference: ${character?.image_prompt?.slice(0, 200)}... 

Now in this scene:"

THEN DESCRIBE THE SCENE (200-300 words):

1. SETTING & ENVIRONMENT:
   - Specific location (rooftop at dusk, underground lab, forest clearing, etc.)
   - Time of day and weather
   - Environmental details (architecture, nature, tech, props)
   - Atmospheric conditions (fog, rain, dust, etc.)

2. CHARACTER IN SCENE:
   - WHERE they are positioned (not centered, use rule of thirds)
   - WHAT they are doing (walking, examining something, reaching, fighting)
   - Body language and movement
   - Expression appropriate to scene
   - How they interact with environment

3. COMPOSITION:
   - Shot type: "Wide shot establishing scene" or "Medium shot showing character and context"
   - Camera angle: "Low angle looking up", "High angle bird's eye view", "Dutch angle for tension"
   - Foreground and background elements
   - Depth layers (foreground, character, background)

4. LIGHTING & ATMOSPHERE:
   - Light source (neon signs, setting sun, flashlight, fire, etc.)
   - Color palette for the scene
   - Mood (ominous, hopeful, tense, serene)
   - Weather effects

5. CINEMATIC STYLE:
   - "Cinematic wide shot, 24mm lens"
   - Color grading reference (blade runner aesthetic, natural documentary style, etc.)
   - "Highly detailed, 8k, professional cinematography"

IMPORTANT: 
- Character should be IN the scene, not dominating it
- Show environmental storytelling
- Each scene must be visually DISTINCT from the others

═══════════════════════════════════════════════════════════════
🎬 SCENE_VIDEO_PROMPT (For Video Generation - What Moves)
═══════════════════════════════════════════════════════════════

MANDATORY OPENING:
"${character?.name} maintains complete visual consistency throughout all motion."

THEN DESCRIBE MOTION (100-150 words):

1. CHARACTER MOVEMENT:
   - Primary action (turning head, walking forward, reaching for object)
   - Secondary motion (hair moving, clothing responding to movement)
   - Pacing (slow deliberate, quick sudden, smooth fluid)

2. CAMERA MOVEMENT:
   - Static or moving?
   - If moving: "Slow dolly in", "Pan left to right", "Orbit around character"
   - Start and end position

3. ENVIRONMENTAL MOTION:
   - Moving elements (leaves falling, cars passing, lights flickering, rain falling)
   - Background activity
   - Atmospheric movement (smoke drifting, clouds moving)

4. TIMING & PACING:
   - What happens first, middle, end
   - Speed and rhythm
   - Dramatic beats

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON Array with exactly 3 scenes):
═══════════════════════════════════════════════════════════════

[
  {
    "scene_image_prompt": "[Mandatory character consistency opening] + [Full scene description 200-300 words]",
    "scene_video_prompt": "[Mandatory motion consistency opening] + [Motion description 100-150 words]"
  },
  {
    "scene_image_prompt": "...",
    "scene_video_prompt": "..."
  },
  {
    "scene_image_prompt": "...",
    "scene_video_prompt": "..."
  }
]

EXAMPLE SCENE 1 (ESTABLISHMENT):
{
  "scene_image_prompt": "Marcus Chen appears in this scene, maintaining visual consistency with the reference: A striking 34-year-old Asian man with short black textured crop hair, dark intense eyes, thin scar on left cheek, wearing charcoal tactical jacket over black sweater...

  Now in this scene: Marcus stands on a rain-slicked rooftop at dusk in a sprawling cyberpunk cityscape. The scene is a wide cinematic shot captured with a 24mm lens, showing Marcus positioned in the right third of the frame, his figure silhouetted against the neon-lit city behind him. Towering skyscrapers with holographic advertisements stretch into the misty distance, their lights reflecting in puddles across the concrete rooftop. Marcus faces away from camera, looking out over the city, his tactical jacket collar turned up against the wind. His posture is contemplative, hands in pockets, weight shifted to one leg. The lighting is moody and atmospheric - cool blue tones from the city lights mix with warm orange neon signs, creating a cyberpunk color palette. Rain falls gently, creating a hazy atmosphere with visible droplets. In the foreground, industrial rooftop equipment (ventilation units, satellite dishes) frame the shot. The background shows the vast urban sprawl with flying vehicles visible as light trails. Cinematic composition with deep depth of field showing layers of environment. Professional cinematography, highly detailed, 8k resolution, blade runner aesthetic, moody color grading with enhanced blues and oranges, atmospheric fog and rain effects.",
  
  "scene_video_prompt": "Marcus Chen maintains complete visual consistency throughout all motion. The camera is static, locked off shot. Marcus slowly turns his head from left to right, scanning the city horizon, his hair moving slightly with the motion. His jacket collar flutters gently in the wind. Rain continues to fall steadily throughout, with droplets visible in the neon light. In the background, holographic advertisements flicker and shift. A flying vehicle passes slowly from left to right in the distant background, its lights creating a smooth light trail. The entire video has a contemplative, establishing mood. Motion is slow and deliberate, taking 5-6 seconds. Atmospheric rain and wind effects continue throughout."
}`;
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