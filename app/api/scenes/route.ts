import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 }
      );
    }

    const { data: scenes, error } = await supabase
      .from("scenes")
      .select("*")
      .eq("chat_id", chatId)
      .order("scene_number", { ascending: true });

    if (error) {
      console.error("Error fetching scenes:", error);
      return NextResponse.json(
        { error: "Failed to fetch scenes" },
        { status: 500 }
      );
    }

    return NextResponse.json({ scenes: scenes || [] });
  } catch (err: any) {
    console.error("Scenes API error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
