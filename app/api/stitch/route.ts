import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RENDI_API_KEY = process.env.RENDI_API_KEY!;
const RENDI_API_URL = "https://api.rendi.dev/v1/run-ffmpeg-command";

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

    // Video-only concat (no audio)
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
      wait_for_completion: true,
      vcpu_count: 2,
    };

    console.log("📦 Payload to Rendi:", JSON.stringify(payload, null, 2));

    const rendiRes = await fetch(RENDI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": RENDI_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const rendiData = await rendiRes.json();
    console.log("📤 Rendi response:", rendiData);

    if (!rendiRes.ok || !rendiData.output_files?.[outputAlias]?.storage_url) {
      throw new Error(
        rendiData.error || rendiData.detail?.[0]?.msg || `Rendi API error: ${rendiRes.statusText}`
      );
    }

    const outputUrl = rendiData.output_files[outputAlias].storage_url;

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
