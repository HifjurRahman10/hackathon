import { createServerSupabase, createAdminSupabase } from './supabase'
import { db } from '@/lib/db/drizzle'
import { users, teamMembers, invitations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
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
  // Check if user exists in local database
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, supabaseUser.id))
    .limit(1)

  if (!existingUser) {
    // Check if this is an invited user
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, supabaseUser.email!),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1)

    // Create user in local database
    const [newUser] = await db
      .insert(users)
      .values({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email!.split('@')[0],
        role: invitation.length > 0 ? invitation[0].role : 'owner', // If invited, use invitation role
      })
      .returning()

    return newUser
  }

  // Update existing user with latest info from Supabase
  const [updatedUser] = await db
    .update(users)
    .set({
      name: supabaseUser.user_metadata?.full_name || existingUser.name,
      email: supabaseUser.email || existingUser.email,
    })
    .where(eq(users.id, existingUser.id))
    .returning()

  return updatedUser
}

// Helper to get user session info
export async function getUserSession() {
  const supabase = await createServerSupabase()
  
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    return null
  }

  return session
}

// Helper to refresh session
export async function refreshSession() {
  const supabase = await createServerSupabase()
  
  const { data, error } = await supabase.auth.refreshSession()
  
  if (error) {
    throw new Error('Failed to refresh session')
  }

  return data.session
}