import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function pollVideoStatus(requestId: string): Promise<string> {
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
        console.log("Video generation completed. URL:", resultUrl);
        return resultUrl;
      } else if (status === "failed") {
        throw new Error(`Video generation failed: ${data.error || "Unknown error"}`);
      } else {
        console.log(`Video still processing. Status: ${status}, Attempt: ${attempts + 1}`);
      }
    } else {
      throw new Error(`Polling error: ${response.status}, ${JSON.stringify(result)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    attempts++;
  }

  throw new Error("Video generation timeout - exceeded maximum wait time");
}

export async function POST(req: Request) {
  try {
    if (!WAVESPEED_API_KEY) {
      return NextResponse.json(
        { error: "WAVESPEED_API_KEY is not set in environment variables" },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { prompt, imageUrl, sceneId, userId, metadata } = body;

    if (!imageUrl || !sceneId) {
      return NextResponse.json(
        { error: "`imageUrl` and `sceneId` are required" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "`userId` is required" },
        { status: 400 }
      );
    }

    const bucket = "user_upload";
    await ensureBucket(bucket);

    const chatId = metadata?.chatId || "default-chat";

    // Submit video generation request to Wavespeed
    console.log(`Submitting video generation for scene ${sceneId}...`);
    
    const url = "https://api.wavespeed.ai/api/v3/alibaba/wan-2.2/i2v-plus-480p";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WAVESPEED_API_KEY}`
    };
    
    const payload = {
      "image": imageUrl, // Scene image URL
      "duration": 8,
      "enable_prompt_expansion": false,
      "seed": -1,
      ...(prompt && { "prompt": prompt }) // Include prompt if provided
    };

    const submitResponse = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error("Wavespeed submission error:", errorText);
      return NextResponse.json(
        { error: `Failed to submit video generation: ${submitResponse.status}` },
        { status: 502 }
      );
    }

    const submitResult = await submitResponse.json();
    const requestId = submitResult.data.id;
    console.log(`Video generation submitted. Request ID: ${requestId}`);

    // Poll for completion
    let videoUrl: string;
    try {
      videoUrl = await pollVideoStatus(requestId);
    } catch (pollError: any) {
      console.error("Video generation polling error:", pollError);
      return NextResponse.json(
        { error: pollError.message || "Video generation failed" },
        { status: 502 }
      );
    }

    // Download the video from Wavespeed
    console.log("Downloading video from Wavespeed...");
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error("Failed to download video from Wavespeed");
    }
    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(videoArrayBuffer);

    // Upload to Supabase
    const timestamp = Date.now();
    const filePath = `${userId}/${chatId}/scene_video_${timestamp}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload video" },
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

    // Update scene record with video URL
    if (sceneId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { error: updateError } = await supabase
        .from("scenes")
        .update({
          video_url: publicUrl,
        })
        .eq("id", sceneId);
      
      if (updateError) {
        console.error("Failed to update scene record:", updateError);
      }
    }

    console.log(`Video generated and uploaded successfully for scene ${sceneId}`);
    return NextResponse.json({ videoUrl: publicUrl, filePath });
  } catch (err: any) {
    console.error("genVideo error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
