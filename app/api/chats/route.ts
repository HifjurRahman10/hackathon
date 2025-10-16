import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supabaseUserId = searchParams.get("userId");

    if (!supabaseUserId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Get local user ID from supabase_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", supabaseUserId)
      .single();

    if (!user) {
      return NextResponse.json({ chats: [] });
    }

    const { data: chats, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
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
    const { userId: supabaseUserId, title } = await req.json();

    if (!supabaseUserId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Get local user ID from supabase_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", supabaseUserId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        user_id: user.id,
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
