import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static"; // ✅ Portable FFmpeg binary
import { createClient } from "@supabase/supabase-js";

// ✅ Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ Force Node runtime (not Edge)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ✅ Main handler
export async function POST(req: Request) {
  try {
    const { videoUrls, userId, chatId } = await req.json();

    // --- Validate input ---
    if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    }
    if (!userId || !chatId) {
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });
    }

    console.log(`🎬 Stitching ${videoUrls.length} videos for chat ${chatId}`);

    // --- Create temp working directory ---
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stitch-"));
    const listFile = path.join(tmpDir, "list.txt");
    const outputFile = path.join(tmpDir, "final.mp4");

    // --- Download input videos ---
    console.log("⬇️ Downloading scene videos...");
    const localFiles: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const res = await fetch(videoUrls[i]);
      if (!res.ok) throw new Error(`Failed to download video ${i + 1}`);
      const data = await res.arrayBuffer();
      const localPath = path.join(tmpDir, `scene_${i}.mp4`);
      await fs.writeFile(localPath, Buffer.from(data));
      localFiles.push(localPath);
    }

    // --- Create FFmpeg list file ---
    const listContent = localFiles.map((f) => `file '${f}'`).join("\n");
    await fs.writeFile(listFile, listContent);
    console.log("🧾 Created FFmpeg concat list");

    // --- Run FFmpeg ---
    console.log("🎞️ Running FFmpeg concat...");
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath!, [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-c",
        "copy",
        outputFile,
      ]);

      ffmpeg.stderr.on("data", (d) => console.log(d.toString()));
      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    // --- Upload stitched file to Supabase ---
    console.log("📤 Uploading stitched video to Supabase...");
    const fileBuffer = await fs.readFile(outputFile);
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("user_upload").getPublicUrl(storagePath);
    const videoUrl = urlData.publicUrl;

    // --- Insert into final_video table ---
    console.log("🧾 Inserting record into final_video table...");
    const { error: dbError } = await supabase
      .from("final_video")
      .insert([{ chat_id: chatId, video_url: videoUrl }]);

    if (dbError) console.error("❌ DB insert error:", dbError);
    else console.log("✅ Record inserted successfully");

    // --- Cleanup temp files ---
    for (const file of localFiles) await fs.unlink(file).catch(() => {});
    await fs.unlink(listFile).catch(() => {});
    await fs.unlink(outputFile).catch(() => {});
    await fs.rmdir(tmpDir).catch(() => {});
    console.log("✨ Cleanup complete");

    // --- Done ---
    return NextResponse.json({ success: true, videoUrl });
  } catch (err: any) {

    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}