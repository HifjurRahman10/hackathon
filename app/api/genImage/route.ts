// app/api/genImage/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Initialize OpenAI and Supabase clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Ensure Supabase bucket exists and is public
async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const existingBucket = buckets?.find((b) => b.name === name);
  
  if (!existingBucket) {
    await supabase.storage.createBucket(name, { public: true });
  } else if (!existingBucket.public) {
    await supabase.storage.updateBucket(name, { public: true });
  }
}

// Poll Wavespeed API for image generation status
async function pollImageStatus(requestId: string): Promise<string> {
  const maxAttempts = 120; // 2 minutes max (120 * 1 second)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`
        }
      }
    );

    const result = await response.json();

    if (response.ok) {
      const data = result.data;
      const status = data.status;

      if (status === "completed") {
        const resultUrl = data.outputs[0];
        console.log("Image generation completed. URL:", resultUrl);
        return resultUrl;
      } else if (status === "failed") {
        throw new Error(`Image generation failed: ${data.error || "Unknown error"}`);
      } else {
        console.log(`Image still processing. Status: ${status}, Attempt: ${attempts + 1}`);
      }
    } else {
      throw new Error(`Polling error: ${response.status}, ${JSON.stringify(result)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    attempts++;
  }

  throw new Error("Image generation timeout - exceeded maximum wait time");
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { prompt, type, recordId, metadata, userId } = body;

    if (!prompt || !type) {
      return NextResponse.json(
        { error: "`prompt` and `type` are required" },
        { status: 400 }
      );
    }

    const mode = type;
    const bucket = "user_upload";
    await ensureBucket(bucket);

    if (!userId) {
      return NextResponse.json(
        { error: "`userId` is required" },
        { status: 400 }
      );
    }

    let finalPrompt = prompt;
    let chatId = metadata?.chatId || "default-chat";

    // If scene, include character details for consistency
    if (mode === "scene") {
      const { data: characterData } = await supabase
        .from("characters")
        .select("character_image_url, character_image_prompt, character_name")
        .eq("chat_id", chatId)
        .single();

      if (characterData) {
        // Include character's visual description from the original prompt for better consistency
        if (characterData.character_image_prompt) {
          finalPrompt = `Include the main character (${characterData.character_name || "character"}) with these exact visual characteristics: ${characterData.character_image_prompt.substring(0, 500)}... \n\nSCENE: ${finalPrompt}`;
        } else if (characterData.character_image_url) {
          finalPrompt += ` Include the main character from reference image: ${characterData.character_image_url}`;
        }
      }
    }

    // Generate image via Wavespeed Seedream V4
    console.log(`Generating ${mode} image with Wavespeed Seedream V4...`);
    
    let imageUrl: string;
    
    if (WAVESPEED_API_KEY) {
      // Use Wavespeed API
      const wavespeedUrl = "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4";
      const wavespeedPayload = {
        prompt: finalPrompt,
        size: "2048*2048",
        enable_base64_output: false,
        enable_sync_mode: false
      };

      const submitResponse = await fetch(wavespeedUrl, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`
        },
        body: JSON.stringify(wavespeedPayload)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error("Wavespeed submission error:", errorText);
        return NextResponse.json(
          { error: `Failed to submit image generation: ${submitResponse.status}` },
          { status: 502 }
        );
      }

      const submitResult = await submitResponse.json();
      const requestId = submitResult.data.id;
      console.log(`Image generation submitted. Request ID: ${requestId}`);

      // Poll for completion
      try {
        imageUrl = await pollImageStatus(requestId);
      } catch (pollError: any) {
        console.error("Image generation polling error:", pollError);
        return NextResponse.json(
          { error: pollError.message || "Image generation failed" },
          { status: 502 }
        );
      }
    } else {
      // Fallback to OpenAI if no Wavespeed key
      console.log("No Wavespeed API key, falling back to OpenAI...");
      let aiResp;
      try {
        aiResp = await openai.images.generate({
          model: "gpt-image-1",
          prompt: finalPrompt,
          quality: "low",
          n: 1,
        });
      } catch (openaiError: any) {
        console.error("OpenAI API error:", openaiError);
        return NextResponse.json(
          { error: openaiError.message || "Failed to generate image" },
          { status: 502 }
        );
      }
      const b64 = aiResp.data?.[0]?.b64_json;
      if (!b64) {
        return NextResponse.json(
          { error: "No image data returned from OpenAI" },
          { status: 502 }
        );
      }
      imageUrl = `data:image/png;base64,${b64}`;
    }

    // Download the image from URL
    console.log("Downloading image...");
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to download image");
    }
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(imageArrayBuffer);
    const timestamp = Date.now();
    const filePath = `${userId}/${chatId}/${mode}_image_${timestamp}.png`;

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (!urlData?.publicUrl) {
      return NextResponse.json(
        { error: "Failed to get public URL" },
        { status: 500 }
      );
    }

    const publicUrl = urlData.publicUrl;

    // Update DB record if valid recordId provided
    if (mode === "character" && recordId && recordId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { error: updateError } = await supabase.from("characters").update({
        character_image_url: publicUrl,
      }).eq("id", recordId);
      
      if (updateError) {
        console.error("Failed to update character record:", updateError);
      }
    } else if (mode === "scene" && recordId && recordId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { error: updateError } = await supabase.from("scenes").update({
        image_url: publicUrl,
      }).eq("id", recordId);
      
      if (updateError) {
        console.error("Failed to update scene record:", updateError);
      }
    }

    return NextResponse.json({ imageUrl: publicUrl, filePath });
  } catch (err: any) {
    console.error("genImage error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
