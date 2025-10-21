import { NextResponse } from "next/server";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
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
    const body = await req.json();
    const { videoUrls, chatId, userId } = schema.parse(body);

    if (videoUrls.length < 2) {
      return NextResponse.json({ error: "At least 2 videos required" }, { status: 400 });
    }

    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-'));
    const inputFiles: string[] = [];
    const outputFile = path.join(tempDir, 'stitched.mp4');

    try {
      // Download videos to temp files
      for (let i = 0; i < videoUrls.length; i++) {
        const response = await fetch(videoUrls[i]);
        if (!response.ok) {
          throw new Error(`Failed to download video ${i + 1}`);
        }
        const buffer = await response.arrayBuffer();
        const inputFile = path.join(tempDir, `input${i}.mp4`);
        fs.writeFileSync(inputFile, Buffer.from(buffer));
        inputFiles.push(inputFile);
      }

      // Create concat file for FFmpeg
      const concatFile = path.join(tempDir, 'concat.txt');
      const concatContent = inputFiles.map(file => `file '${path.basename(file)}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Use fluent-ffmpeg to concatenate using concat demuxer
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatFile)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c copy'])
          .output(outputFile)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // Read the output file
      const outputBuffer = fs.readFileSync(outputFile);

      // Upload to Supabase storage
      const fileName = `stitched-${chatId}-${Date.now()}.mp4`;
      const { data, error } = await supabase.storage
        .from('user_upload')
        .upload(fileName, outputBuffer, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user_upload')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }

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
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
