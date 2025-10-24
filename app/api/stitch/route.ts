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

    // --- STEP 1️⃣ Build input_files for Rendi ---
    const inputFiles = videoUrls.map((url, i) => ({
      path: `input${i}.mp4`, // name inside Rendi container
      url, // public URL from Supabase
    }));

    // --- STEP 2️⃣ Build FFmpeg command referencing those local inputs ---
    const inputs = inputFiles.map((f) => `-i ${f.path}`).join(" ");
    const n = inputFiles.length;
    const filter =
      inputFiles.map((_, i) => `[${i}:v][${i}:a]`).join("") +
      `concat=n=${n}:v=1:a=1[outv][outa]`;

    const ffmpegCommand = `${inputs} -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart output.mp4`;

    console.log("⚙️ Sending FFmpeg command to Rendi:", ffmpegCommand);

    // --- STEP 3️⃣ Submit to Rendi ---
    const rendiRes = await fetch(RENDI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": RENDI_API_KEY,
      },
      body: JSON.stringify({
        input_files: inputFiles, // ✅ Rendi downloads these first
        command: ffmpegCommand,
        output_files: [{ path: "output.mp4" }], // ✅ must be objects, not strings
        wait_for_completion: true,
      }),
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

    const outputUrl = rendiData.output_files?.[0]?.url;
    if (!outputUrl) throw new Error("No output file returned from Rendi");

    console.log("✅ Rendi completed, output:", outputUrl);

    // --- STEP 4️⃣ Upload to Supabase ---
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

    // --- STEP 5️⃣ Record to DB ---
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
