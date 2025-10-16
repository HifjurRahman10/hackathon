import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { data: chats, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ chats });
  } catch (err: any) {
    console.error("Get chats error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, title } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        user_id: userId,
        title: title || "New Chat",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ chat });
  } catch (err: any) {
    console.error("Create chat error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json({ error: "chatId required" }, { status: 400 });
    }

    const { error } = await supabase.from("chats").delete().eq("id", chatId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete chat error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
