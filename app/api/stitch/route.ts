import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RENDI_API_KEY = process.env.RENDI_API_KEY!;
const RENDI_API_URL = "https://api.rendi.dev/v1/run-ffmpeg-command";

export async function POST(req: Request) {
  console.log("🧩 /api/stitch (Rendi) invoked");

  try {
    const { videoUrls, userId, chatId } = await req.json();

    if (!Array.isArray(videoUrls) || videoUrls.length < 2)
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    if (!userId || !chatId)
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });

    console.log(`🎬 Stitching ${videoUrls.length} videos`);

    // ✅ Alias input files
    const input_files: Record<string, string> = {};
    videoUrls.forEach((url, i) => {
      input_files[`in_${i}`] = url;
    });

    // ✅ Use aliases in FFmpeg command
    const inputs = videoUrls.map((_, i) => `-i {{in_${i}}}`).join(" ");
    const filter = videoUrls.map((_, i) => `[${i}:v][${i}:a]`).join("") +
                   `concat=n=${videoUrls.length}:v=1:a=1[outv][outa]`;

    const outputFileKey = "out_1";
    const outputFileName = "stitched_output.mp4";

    const command = `${inputs} -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart -y {{${outputFileKey}}}`;

    console.log("⚙️ FFmpeg command:", command);

    // ✅ Rendi API payload
    const payload = {
      command,
      input_files,
      output_files: {
        [outputFileKey]: outputFileName,
      },
      wait_for_completion: true,
      vcpus: 1,
    };

    console.log("📦 Payload to Rendi:", JSON.stringify(payload, null, 2));

    const rendiRes = await fetch(RENDI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": RENDI_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const rendiData = await rendiRes.json();
    console.log("📤 Rendi response:", rendiData);

    if (!rendiRes.ok) {
      throw new Error(
        rendiData.error ||
        rendiData.detail?.[0]?.msg ||
        `Rendi API error: ${rendiRes.statusText}`
      );
    }

    const outputUrl = rendiData.output_files?.[outputFileKey]?.url;
    if (!outputUrl) throw new Error("No output file returned from Rendi");

    console.log("✅ Rendi completed, output:", outputUrl);

    // ✅ Upload to Supabase
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
      { chat_id: chatId, video_url: finalVideoUrl, created_at: new Date().toISOString() },
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
