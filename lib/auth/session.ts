// lib/auth/session.ts
import { createSupabaseClient } from './supabase'
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

  // Try to find the user in your local DB by supabase_id
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, supabaseUser.id))
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
      name: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
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
  const supabase = await createSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) return null
  return session
}

/**
 * Get the current user from Supabase auth
 */
export async function getUser() {
  const supabase = await createSupabaseClient()
  
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

/**
 * Get the current session from Supabase auth
 */
export async function getSession() {
  const supabase = await createSupabaseClient()
  
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session) {
    return null
  }

  return session
}

/**
 * Get the current user and sync with local database
 */
export async function getUserWithSync() {
  const supabaseUser = await getUser()
  
  if (!supabaseUser) {
    return null
  }

  try {
    const localUser = await syncUser(supabaseUser)
    return { supabaseUser, localUser }
  } catch (error) {
    console.error('Error syncing user:', error)
    return { supabaseUser, localUser: null }
  }
}
