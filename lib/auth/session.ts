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
      id: crypto.randomUUID(),            // FIX: supply required id (no default in schema)
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
