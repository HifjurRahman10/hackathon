import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Poll helper to wait until Rendi render completes
async function pollRendiStatus(requestId: string, maxAttempts = 100, delay = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`https://api.rendi.dev/v1/requests/${requestId}`, {
      headers: { "x-api-key": process.env.RENDI_API_KEY! },
    });
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error("Rendi render failed");
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Rendi polling timeout");
}

export async function POST(req: Request) {
  console.log("🧩 /api/stitch (Rendi) invoked");
  try {
    const { videoUrls, userId, chatId } = await req.json();

    if (!Array.isArray(videoUrls) || videoUrls.length < 2)
      return NextResponse.json({ error: "Need at least 2 videos" }, { status: 400 });
    if (!userId || !chatId)
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log(`🎬 Stitching ${videoUrls.length} videos via Rendi`);

    // Step 1️⃣: Build concat.txt content
    const concatList = videoUrls.map((url) => `file '${url}'`).join("\n");
    const concatBase64 = Buffer.from(concatList).toString("base64");

    // Step 2️⃣: Call Rendi API
    const payload = {
      input_files: [
        // FFmpeg requires a list file; we'll upload it inline via base64
        { name: "concat.txt", data: concatBase64, encoding: "base64" },
      ],
      command: `-f concat -safe 0 -i concat.txt -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart output.mp4`,
      output_files: [{ name: "output.mp4" }],
    };

    const startRes = await fetch("https://api.rendi.dev/v1/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.RENDI_API_KEY!,
      },
      body: JSON.stringify(payload),
    });

    const startData = await startRes.json();
    if (!startRes.ok) throw new Error(startData.error || "Rendi job start failed");

    const requestId = startData.request_id;
    console.log("🕓 Rendi request started:", requestId);

    // Step 3️⃣: Poll for completion
    const result = await pollRendiStatus(requestId);
    const outputUrl = result.output_files?.[0]?.url;
    if (!outputUrl) throw new Error("No output URL from Rendi");

    console.log("✅ Rendi render complete:", outputUrl);

    // Step 4️⃣: Upload final to Supabase
    const res = await fetch(outputUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const storagePath = `${userId}/${chatId}/stitched_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("user_upload")
      .upload(storagePath, buffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("user_upload").getPublicUrl(storagePath);
    const finalVideoUrl = urlData.publicUrl;

    // Step 5️⃣: Save to DB
    const { error: dbError } = await supabase
      .from("final_video")
      .insert([{ chat_id: chatId, video_url: finalVideoUrl }]);

    if (dbError) console.error("⚠️ DB insert error:", dbError);
    else console.log("✅ Record inserted successfully");

    return NextResponse.json({ success: true, videoUrl: finalVideoUrl });
  } catch (err: any) {
    console.error("🔥 Rendi Stitch error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
  }
}
