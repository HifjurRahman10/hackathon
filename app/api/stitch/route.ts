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

    // Step 1️⃣: Create alias-based input file map
    const inputAliasMap: Record<string, string> = {};
    videoUrls.forEach((url, i) => {
      inputAliasMap[`in_${i}`] = url;
    });

    // Step 2️⃣: Build FFmpeg command using {{in_x}} and {{out_1}}
    const inputRefs = Object.keys(inputAliasMap)
      .map((key) => `-i {{${key}}}`)
      .join(" ");
    const filter = Object.keys(inputAliasMap)
      .map((_, i) => `[${i}:v][${i}:a]`)
      .join("") + `concat=n=${videoUrls.length}:v=1:a=1[outv][outa]`;

    const outputFileKey = "out_1";
    const outputFileName = "stitched_output.mp4";
    const command = `${inputRefs} -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart {{${outputFileKey}}}`;

    // Step 3️⃣: Construct final Rendi payload
    const payload = {
      command,
      input_files: {
        inputs: inputAliasMap,
      },
      output_files: {
        outputs: {
          [outputFileKey]: outputFileName,
        },
      },
      wait_for_completion: true,
    };

    console.log("📦 Payload to Rendi:", JSON.stringify(payload, null, 2));

    // Step 4️⃣: Submit job to Rendi
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

    const outputUrl = rendiData.output_files?.outputs?.[outputFileKey]?.url;
    if (!outputUrl) throw new Error("No output file URL returned from Rendi");

    console.log("✅ Rendi completed. Output URL:", outputUrl);

    // Step 5️⃣: Upload final stitched video to Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const stitchedRes = await fetch(outputUrl);
    const buffer = Buffer.from(await stitchedRes.arrayBuffer());
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, buffer, { contentType: "video/mp4" });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("user_upload")
      .getPublicUrl(storagePath);

    const finalVideoUrl = urlData.publicUrl;

    // Step 6️⃣: Save metadata to DB
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
