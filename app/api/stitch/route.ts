import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Poll Rendi until job is done
async function pollRendiStatus(jobId: string, maxAttempts = 120, delay = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`https://api.rendi.dev/v1/jobs/${jobId}`, {
      headers: { "x-api-key": process.env.RENDI_API_KEY! },
    });
    const data = await res.json();

    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.error || "Rendi job failed");

    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Rendi job timed out");
}

export async function POST(req: Request) {
  console.log("🧩 /api/stitch (Rendi) invoked");

  try {
    const { videoUrls, userId, chatId } = await req.json();

    if (!Array.isArray(videoUrls) || videoUrls.length < 2)
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    if (!userId || !chatId)
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });

    console.log(`🎬 Stitching ${videoUrls.length} videos via Rendi`);

    // Build FFmpeg command to concatenate all videos
    // Rendi automatically downloads URLs before execution
    const concatCommand =
      "-f concat -safe 0 -i <(printf \"" +
      videoUrls.map((url) => `file '${url}'`).join("\\n") +
      "\") -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart output.mp4";

    // Step 1️⃣: Submit to Rendi
    const payload = {
      command: concatCommand,
      output_files: ["output.mp4"],
    };

    const startRes = await fetch("https://api.rendi.dev/v1/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.RENDI_API_KEY!,
      },
      body: JSON.stringify(payload),
    });

    const startData = await startRes.json();
    console.log("📤 Rendi API response:", startData);

    if (!startRes.ok || !startData.id)
      throw new Error(startData.error || "Rendi job start failed");

    const jobId = startData.id;
    console.log("🕓 Rendi job started:", jobId);

    // Step 2️⃣: Poll for completion
    const result = await pollRendiStatus(jobId);
    const outputUrl = result.output_files?.[0]?.url;
    if (!outputUrl) throw new Error("No output URL from Rendi");

    console.log("✅ Rendi job complete:", outputUrl);

    // Step 3️⃣: Upload final stitched video to Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const videoRes = await fetch(outputUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, buffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("user_upload").getPublicUrl(storagePath);
    const finalVideoUrl = urlData.publicUrl;

    // Step 4️⃣: Insert record into database
    const { error: dbError } = await supabase
      .from("final_video")
      .insert([{ chat_id: chatId, video_url: finalVideoUrl }]);

    if (dbError) console.error("⚠️ DB insert error:", dbError);
    else console.log("✅ Record inserted successfully");

    return NextResponse.json({ success: true, videoUrl: finalVideoUrl });
  } catch (err: any) {
    console.error("🔥 Rendi Stitch error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}
