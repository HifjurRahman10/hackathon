import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPathImport from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ✅ Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ Ensure ffmpeg-static binary path works both locally & on Vercel
const ffmpegPath =
  ffmpegPathImport ||
  path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg");

export async function POST(req: Request) {
  console.log("🧩 /api/stitch invoked");

  try {
    // --- Parse and validate request ---
    const bodyText = await req.text();
    console.log("📩 Incoming body:", bodyText);
    const { videoUrls, userId, chatId } = JSON.parse(bodyText || "{}");

    if (!Array.isArray(videoUrls) || videoUrls.length < 2)
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });

    if (!userId || !chatId)
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });

    console.log(`🎬 Stitching ${videoUrls.length} videos for chat ${chatId}`);
    console.log("FFmpeg path:", ffmpegPath);

    // --- Create temporary working directory ---
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stitch-"));
    const listFile = path.join(tmpDir, "list.txt");
    const outputFile = path.join(tmpDir, "final.mp4");

    // --- Download all videos locally ---
    console.log("⬇️ Downloading scene videos...");
    const localFiles: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      console.log(`🔹 Downloading ${videoUrls[i]}...`);
      const res = await fetch(videoUrls[i]);
      if (!res.ok) throw new Error(`Failed to download video ${i + 1}: ${res.status}`);
      const data = await res.arrayBuffer();
      const localPath = path.join(tmpDir, `scene_${i}.mp4`);
      await fs.writeFile(localPath, Buffer.from(data));
      localFiles.push(localPath);
    }

    // --- Create FFmpeg concat list file ---
    await fs.writeFile(listFile, localFiles.map(f => `file '${f}'`).join("\n"));
    console.log("🧾 Created FFmpeg concat list");

    // --- Run FFmpeg with re-encode (fixes codec mismatch issues) ---
    console.log("🎞️ Running FFmpeg concat + re-encode...");
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",
        outputFile,
      ]);

      ffmpeg.stdout.on("data", (d) => console.log(d.toString()));
      ffmpeg.stderr.on("data", (d) => console.error(d.toString()));
      ffmpeg.on("close", (code) => {
        console.log("FFmpeg exited with code:", code);
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    // --- Upload final stitched video to Supabase ---
    console.log("📤 Uploading stitched video to Supabase...");
    const fileBuffer = await fs.readFile(outputFile);
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("❌ Upload failed:", uploadError);
      throw new Error(uploadError.message);
    }

    const { data: urlData } = supabase.storage.from("user_upload").getPublicUrl(storagePath);
    const videoUrl = urlData.publicUrl;

    // --- Insert into final_video table ---
    console.log("🧾 Inserting record into final_video table...");
    const { error: dbError } = await supabase
      .from("final_video")
      .insert([{ chat_id: chatId, video_url: videoUrl }]);

    if (dbError) console.error("⚠️ DB insert error:", dbError);
    else console.log("✅ Record inserted successfully");

    // --- Cleanup temp files ---
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    console.log("✨ Cleanup complete");

    // --- Done ---
    console.log("✅ Final stitched video:", videoUrl);
    return NextResponse.json({ success: true, videoUrl });

  } catch (err: any) {
    console.error("🔥 Stitch error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}
