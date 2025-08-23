// lib/auth/session.ts
import { createServerSupabase } from './supabase'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Syncs a Supabase user with your local DB.
 */
export async function syncUser(supabaseUser: any) {
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
      supabaseId: supabaseUser.id,  // Required because of .notNull()
      name: supabaseUser.user_metadata?.full_name || '',
      avatar_url: supabaseUser.user_metadata?.avatar_url || null,
      role: 'member'  // Has a default, but included for clarity
    })
    .returning();

  return newUser
}

/**
 * Verify a JWT access token from Supabase.
 * Returns the user object if valid, otherwise null.
 */
export async function verifyToken(token: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) return null
  return data.user
}
