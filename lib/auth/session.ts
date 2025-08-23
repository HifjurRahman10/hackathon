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
export async function syncUser(supabaseUser: SupabaseUser): Promise<User> {
  if (!supabaseUser.email) {
    throw new Error('Supabase user has no email')
  }

  // Try to find the user in your local DB
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, supabaseUser.email))
    .limit(1)

  if (existingUser) {
    return existingUser
  }

  // If not found, insert a new user
  const [newUser] = await db
    .insert(users)
    .values({
      email: supabaseUser.email,
      supabaseId: supabaseUser.id,
      name: supabaseUser.user_metadata?.full_name || '',
      role: 'member'
    })
    .returning()

  return newUser
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
