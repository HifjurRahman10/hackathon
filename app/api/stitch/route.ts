import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RENDI_API_KEY = process.env.RENDI_API_KEY!;
const RENDI_API_URL = "https://api.rendi.dev/v1/run-ffmpeg-command";
const RENDI_POLL_URL = "https://api.rendi.dev/v1/commands";

export async function POST(req: Request) {
  console.log("🧩 /api/stitch (Rendi) invoked");

  try {
    const { videoUrls, userId, chatId } = await req.json();

    if (!Array.isArray(videoUrls) || videoUrls.length < 2)
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    if (!userId || !chatId)
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });

    console.log(`🎬 Stitching ${videoUrls.length} videos`);

    const input_files: Record<string, string> = {};
    const inputRefs = videoUrls.map((url, i) => {
      const alias = `in_${i}`;
      input_files[alias] = url;
      return `-i {{${alias}}}`;
    });

    const filter =
      videoUrls.map((_, i) => `[${i}:v][${i}:a]`).join("") +
      `concat=n=${videoUrls.length}:v=1:a=1[outv][outa]`;

    const outputAlias = "out_1";
    const outputFileName = "stitched_output.mp4";

    const ffmpegCommand = `${inputRefs.join(" ")} -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart {{${outputAlias}}}`;

    console.log("⚙️ FFmpeg command:", ffmpegCommand);

    const payload = {
      ffmpeg_command: ffmpegCommand,
      input_files,
      output_files: { [outputAlias]: outputFileName },
      vcpu_count: 2,
    };

    console.log("📦 Payload to Rendi:", JSON.stringify(payload, null, 2));

    const commandRes = await fetch(RENDI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": RENDI_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const commandData = await commandRes.json();
    console.log("📤 Rendi response:", commandData);

    if (!commandRes.ok || !commandData.command_id) {
      throw new Error(
        commandData?.detail?.[0]?.msg ||
          commandData?.error ||
          "Failed to submit FFmpeg command"
      );
    }

    const commandId = commandData.command_id;

    // 🕒 Poll for command completion
    let status = "";
    let outputUrl = "";
    for (let i = 0; i < 30; i++) {
      const pollRes = await fetch(`${RENDI_POLL_URL}/${commandId}`, {
        headers: { "X-API-KEY": RENDI_API_KEY },
      });
      const pollData = await pollRes.json();

      status = pollData.status;
      console.log(`⏱️ [${i + 1}] Status: ${status}`);

      if (status === "SUCCESS") {
        outputUrl = pollData.output_files?.[outputAlias]?.storage_url;
        break;
      }

      if (status === "FAILED") {
        throw new Error(pollData?.error_message || "Rendi command failed");
      }

      await new Promise((r) => setTimeout(r, 4000));
    }

    if (!outputUrl) throw new Error("No output file returned from Rendi");

    // 🎯 Upload to Supabase
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

    await supabase.from("final_video").insert([
      {
        chat_id: chatId,
        video_url: finalVideoUrl,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ success: true, videoUrl: finalVideoUrl });
  } catch (err: any) {
    console.error("🔥 Rendi Stitch Error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
