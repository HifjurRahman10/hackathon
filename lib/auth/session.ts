import { createServerSupabase, createAdminSupabase } from './supabase'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'

export async function getUser() {
  const supabase = await createServerSupabase()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }

  // Get user from local database using Supabase user ID
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, user.id))
    .limit(1)

  return dbUser || null
}

export async function signOut() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
}

// Helper to sync Supabase user with local database
export async function syncUser(supabaseUser: User) {
  const adminSupabase = createAdminSupabase()
  
  // Check if user exists in local database
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, supabaseUser.id))
    .limit(1)

  if (!existingUser) {
    // Create user in local database
    const [newUser] = await db
      .insert(users)
      .values({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email!.split('@')[0],
        role: 'owner', // Default role
      })
      .returning()

    return newUser
  }

  return existingUser
}