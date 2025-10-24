import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RENDI_API_KEY = process.env.RENDI_API_KEY!;
const RENDI_API_URL = "https://api.rendi.dev/v1/run-ffmpeg-command";
const POLL_URL = "https://api.rendi.dev/v1/commands";

export async function POST(req: Request) {
  console.log("🧩 /api/stitch (Rendi) invoked");

  try {
    const { videoUrls, userId, chatId } = await req.json();

    if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    }
    if (!userId || !chatId) {
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });
    }

    console.log(`🎬 Stitching ${videoUrls.length} videos`);

    const input_files: Record<string, string> = {};
    const inputRefs = videoUrls.map((url, i) => {
      const alias = `in_${i}`;
      input_files[alias] = url;
      return `-i {{${alias}}}`;
    });

    const filter = videoUrls.map((_, i) => `[${i}:v]`).join("") +
      `concat=n=${videoUrls.length}:v=1:a=0[outv]`;

    const outputAlias = "out_1";
    const outputFileName = "stitched_output.mp4";

    const ffmpegCommand = `${inputRefs.join(" ")} -filter_complex "${filter}" -map "[outv]" -c:v libx264 -preset fast -crf 23 -movflags +faststart {{${outputAlias}}}`;

    console.log("⚙️ FFmpeg command:", ffmpegCommand);

    const payload = {
      ffmpeg_command: ffmpegCommand,
      input_files,
      output_files: { [outputAlias]: outputFileName },
      wait_for_completion: false,
      vcpu_count: 2,
    };

    console.log("📦 Payload to Rendi:", payload);

    const submitRes = await fetch(RENDI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": RENDI_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const submitData = await submitRes.json();
    console.log("📤 Rendi response:", submitData);

    if (!submitRes.ok || !submitData.command_id) {
      throw new Error(submitData.error || submitData.detail?.[0]?.msg || "Failed to submit FFmpeg job");
    }

    // ⏱️ Poll for result
    const commandId = submitData.command_id;
    let outputUrl: string | null = null;
    let attempts = 0;
    let status = "QUEUED";

    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${POLL_URL}/${commandId}`, {
        headers: { "X-API-KEY": RENDI_API_KEY },
      });
      const pollData = await pollRes.json();
      status = pollData.status;
      console.log(`⏱️ Poll [${attempts + 1}] Status: ${status}`);

      if (status === "SUCCESS") {
        outputUrl = pollData.output_files?.[outputAlias]?.storage_url;
        break;
      } else if (status === "FAILED") {
        throw new Error(pollData.error_message || "Rendi job failed.");
      }

      attempts++;
    }

    if (!outputUrl) throw new Error("Timed out waiting for Rendi output");

    // ⬆️ Upload stitched video to Supabase Storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const videoRes = await fetch(outputUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, buffer, { contentType: "video/mp4" });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("user_upload")
      .getPublicUrl(storagePath);
    const finalVideoUrl = urlData.publicUrl;

    // 🧾 Insert to final_video table
    const { error: dbError } = await supabase
      .from("final_video")
      .insert([{ chat_id: chatId, video_url: finalVideoUrl }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, videoUrl: finalVideoUrl });

  } catch (err: any) {
    console.error("🔥 Rendi Stitch Error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}
