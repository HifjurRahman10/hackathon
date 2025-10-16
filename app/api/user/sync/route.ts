import { NextResponse } from "next/server";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { supabaseUser } = await req.json();

    if (!supabaseUser?.id || !supabaseUser?.email) {
      return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
    }

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.supabaseId, supabaseUser.id))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ user: existingUser });
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        email: supabaseUser.email,
        supabaseId: supabaseUser.id,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
        role: 'member'
      })
      .returning();

    return NextResponse.json({ user: newUser });
  } catch (err: any) {
    console.error("Sync user error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
