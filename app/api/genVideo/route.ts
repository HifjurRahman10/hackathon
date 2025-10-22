import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureBucket(name: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === name);
  if (!existing) await supabase.storage.createBucket(name, { public: true });
  else if (!existing.public) await supabase.storage.updateBucket(name, { public: true });
}

async function pollVideoStatus(requestId: string): Promise<string> {
  const maxAttempts = 120; // 2 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    const res = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } }
    );
    const json = await res.json();

    if (res.ok && json.data?.status) {
      const status = json.data.status;
      if (status === "completed") {
        const url = json.data.outputs[0];
        console.log("✅ Video ready:", url);
        return url;
      } else if (status === "failed") {
        throw new Error(`Video generation failed: ${json.data.error || "Unknown"}`);
      } else {
        console.log(`⏳ Waiting (${attempts + 1}): ${status}`);
      }
    } else {
      console.error("Polling failed:", json);
      throw new Error(`Polling error: ${res.status}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
  }

  throw new Error("Video generation timeout");
}

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, sceneId, userId, metadata } = await req.json();
    if (!WAVESPEED_API_KEY)
      return NextResponse.json({ error: "Missing WAVESPEED_API_KEY" }, { status: 500 });
    if (!imageUrl || !sceneId)
      return NextResponse.json({ error: "`imageUrl` and `sceneId` required" }, { status: 400 });
    if (!userId)
      return NextResponse.json({ error: "`userId` required" }, { status: 400 });

    const bucket = "user_upload";
    await ensureBucket(bucket);
    const chatId = metadata?.chatId || "default-chat";

    console.log(`🎬 Generating video for scene ${sceneId}...`);

    const submitRes = await fetch(
      "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-pro-i2v-480p",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          image: imageUrl,
          duration: 10,
          "camera-fixed": false,
          seed: -1,
          ...(prompt && { prompt }),
        }),
      }
    );

    if (!submitRes.ok) {
      const errTxt = await submitRes.text();
      console.error("❌ Submit error:", errTxt);
      return NextResponse.json({ error: "Wavespeed submission failed" }, { status: 502 });
    }

    const submitJson = await submitRes.json();
    const requestId = submitJson.data.id;
    console.log("🆔 Wavespeed request:", requestId);

    const resultUrl = await pollVideoStatus(requestId);
    console.log("🌐 Result URL:", resultUrl);

    // 🪄 Upload directly from URL to Supabase Storage
    const timestamp = Date.now();
    const filePath = `${userId}/${chatId}/scene_video_${timestamp}.mp4`;

    const uploadRes = await fetch(resultUrl);
    const videoArray = await uploadRes.arrayBuffer();
    const videoBuffer = Buffer.from(videoArray);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const videoUrl = urlData.publicUrl;

    // 🧾 Update scenes table
    const { error: updateError } = await supabase
      .from("scenes")
      .update({ video_url: videoUrl })
      .eq("id", sceneId);

    if (updateError) console.error("DB update failed:", updateError);
    else console.log(`✅ Scene ${sceneId} updated with video URL`);

    return NextResponse.json({ videoUrl, filePath });
  } catch (err: any) {
    console.error("🔥 genVideo error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}
