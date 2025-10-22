import { NextResponse } from "next/server";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { db } from '@/lib/db/drizzle';
import { finalVideo } from '@/lib/db/schema';

// Set ffmpeg path
console.log("FFmpeg static path:", ffmpegStatic);
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
  console.log("Set FFmpeg path to:", ffmpegStatic);
} else {
  console.log("FFmpeg static not found, using system FFmpeg");
}


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const schema = z.object({
  videoUrls: z.array(z.string()),
  chatId: z.string(),
  userId: z.string(),
});

export async function POST(req: Request) {
  try {
    console.log("Stitch API called");
    const body = await req.json();
    console.log("Request body:", body);
    const { videoUrls, chatId, userId } = schema.parse(body);
    console.log("Parsed data:", { videoUrls: videoUrls.length, chatId, userId });

    // Verify chat belongs to user
    const { data: chat } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (!chat) {
      return NextResponse.json({ error: "Chat not found or access denied" }, { status: 403 });
    }

    if (videoUrls.length < 2) {
      console.log("Not enough videos:", videoUrls.length);
      return NextResponse.json({ error: "At least 2 videos required" }, { status: 400 });
    }

    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-'));
    console.log("Created temp dir:", tempDir);
    const inputFiles: string[] = [];
    const outputFile = path.join(tempDir, 'stitched.mp4');

    try {
      // Download videos to temp files
      console.log("Starting video downloads...");
      for (let i = 0; i < videoUrls.length; i++) {
        console.log(`Downloading video ${i + 1}: ${videoUrls[i]}`);
        const response = await fetch(videoUrls[i]);
        if (!response.ok) {
          throw new Error(`Failed to download video ${i + 1}: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const inputFile = path.join(tempDir, `input${i}.mp4`);
        fs.writeFileSync(inputFile, Buffer.from(buffer));
        inputFiles.push(inputFile);
        console.log(`Saved video ${i + 1} to ${inputFile}`);
      }
      console.log("All videos downloaded");

      // Create concat file for FFmpeg
      const concatFile = path.join(tempDir, 'concat.txt');
      const concatContent = inputFiles.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Use fluent-ffmpeg to concatenate using concat demuxer
      console.log("Starting FFmpeg concatenation...");
      console.log("Concat file:", concatFile);
      console.log("Output file:", outputFile);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatFile)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
          .output(outputFile)
          .on('start', (commandLine: string) => {
            console.log('FFmpeg command: ' + commandLine);
          })
          .on('progress', (progress: any) => {
            console.log('FFmpeg progress: ' + progress.percent + '% done');
          })
          .on('end', () => {
            console.log('FFmpeg finished successfully');
            resolve();
          })
          .on('error', (err: Error) => {
            console.error('FFmpeg error:', err);
            reject(err);
          })
          .run();
      });

      console.log("FFmpeg concatenation completed");

      // Read the output file
      const outputBuffer = fs.readFileSync(outputFile);

      // Upload to Supabase storage
      console.log("Uploading to Supabase...");
      const fileName = `stitched-${chatId}-${Date.now()}.mp4`;
      console.log("Upload filename:", fileName);
      const { data, error } = await supabase.storage
        .from('user_upload')
        .upload(fileName, outputBuffer, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (error) {
        console.error("Supabase upload error:", error);
        throw error;
      }
      console.log("Upload successful");

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user_upload')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      console.log("Final video URL:", urlData.publicUrl);

      // Save to database
      await db.insert(finalVideo).values({
        chatId: chatId,
        videoUrl: urlData.publicUrl,
      });

      return NextResponse.json({ videoUrl: urlData.publicUrl });
    } finally {
      // Clean up temp files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
    }
  } catch (err: any) {
    console.error("Stitch API error:", err);
    console.error("Error stack:", err.stack);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
