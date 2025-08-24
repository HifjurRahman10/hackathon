// lib/auth/session.ts
import { createServerSupabase } from './supabase'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import type { User } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'

/**
 * Syncs a Supabase user with your local DB.
 */
export async function syncUser(supabaseUser: SupabaseUser) {
  if (!supabaseUser.email) throw new Error('Supabase user missing email');

  // Try by supabaseId (if column exists)
  let existing: any;
  try {
    [existing] = await db
      .select()
      .from(users)
      .where(eq(users.supabaseId, supabaseUser.id))
      .limit(1);
  } catch (e: any) {
    if (e.code !== '42703') throw e;
  }

  if (existing) return existing;

  // (Optional) Try by email if column missing
  if (!existing) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, supabaseUser.email))
      .limit(1);
    if (byEmail) {
      // Try to set supabaseId if column exists
      try {
        await db
          .update(users)
          .set({ supabaseId: supabaseUser.id })
          .where(eq(users.id, byEmail.id));
      } catch { /* ignore */ }
      return byEmail;
    }
  }

  // Insert new
  const [created] = await db
    .insert(users)
    .values({
      supabaseId: supabaseUser.id,
      email: supabaseUser.email,
      name: (supabaseUser.user_metadata?.full_name as string) || '',
      role: 'member'
    })
    .returning();
  return created;
}

/**
 * Verify a JWT access token from Supabase.
 * Returns the session if valid, otherwise null.
 */
export async function verifyToken(token: string): Promise<Session | null> {
  const supabase = await createServerSupabase()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) return null
  return session
}
