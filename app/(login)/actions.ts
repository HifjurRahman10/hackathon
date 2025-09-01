'use server'

import { z } from 'zod'
import { createServerSupabase } from '@/lib/auth/supabase'
import { syncUser, getUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { getUserWithTeam } from '@/lib/db/queries'
import { validatedAction, validatedActionWithUser } from '@/lib/auth/middleware'
import { teams, teamMembers, activityLogs, invitations, users, type NewActivityLog, ActivityType } from '@/lib/db/schema'
import { db } from '@/lib/db/drizzle'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function logActivity(
  teamId: string | null | undefined,
  userId: string,
  type: ActivityType,
  ipAddress?: string
) {
  if (!teamId || !userId) return
  await supabase.from('activity_logs').insert({
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  } as any)
}

// -------------------- SIGN IN --------------------
const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
})

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data
  const supa = await createServerSupabase()

  const { data: authData, error } = await supa.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Invalid email or password', email, password }

  if (authData.user) {
    const user = await syncUser(authData.user)
    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_IN)

    const redirectTo = formData.get('redirect') as string | null
    if (redirectTo === 'checkout') {
      const priceId = formData.get('priceId') as string
      redirect(`/checkout?priceId=${priceId}`)
    }

    redirect('/dashboard')
  }

  return { error: 'Authentication failed' }
})

// -------------------- SIGN UP --------------------
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional()
})

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data
  const supa = await createServerSupabase()

  let invitation: any = null
  if (inviteId) {
    const found = await db.select().from(invitations)
      .where(and(eq(invitations.id, inviteId), eq(invitations.email, email), eq(invitations.status, 'pending')))
      .limit(1)
    invitation = found[0]
    if (!invitation) return { error: 'Invalid or expired invitation.', email, password }
  }

  // Create user in Supabase
  const { data: authData, error } = await supa.auth.signUp({
    email,
    password,
    options: { data: { invitation_id: inviteId } }
  })
  if (error) return { error: error.message || 'Failed to create account.', email, password }

  const supabaseId = authData.user?.id
  if (!supabaseId) return { error: 'Failed to retrieve user ID from Supabase', email, password }

  // ✅ Sync user to local DB (will insert if missing)
  const user = await syncUser(authData.user!)

  // Handle invitations
  if (invitation) {
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      userId: user.id,
      teamId: invitation.teamId,
      role: invitation.role
    } as any)

    await db.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invitation.id))
    await logActivity(invitation.teamId, user.id, ActivityType.ACCEPT_INVITATION)
  }

  const userTeamId = invitation?.teamId || (await getUserWithTeam(user.id))?.teamId
  await logActivity(userTeamId, user.id, ActivityType.SIGN_IN)

  redirect('/dashboard')
})

// -------------------- SIGN OUT --------------------
export async function signOut() {
  const user = await getUser()
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT)
  }
  const supa = await createServerSupabase()
  await supa.auth.signOut()
  redirect('/sign-in')
}

// -------------------- UPDATE PASSWORD --------------------
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
})

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data
    const supa = await createServerSupabase()

    if (currentPassword === newPassword) return { error: 'New password must be different.' }
    if (confirmPassword !== newPassword) return { error: 'Passwords do not match.' }

    const { error } = await supa.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }

    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)

    return { success: 'Password updated successfully.' }
  }
)

// -------------------- DELETE ACCOUNT --------------------
const deleteAccountSchema = z.object({ password: z.string().min(8).max(100) })

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data
    const supa = await createServerSupabase()

    const { error: verifyError } = await supa.auth.signInWithPassword({ email: user.email, password })
    if (verifyError) return { error: 'Incorrect password. Account deletion failed.' }

    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.DELETE_ACCOUNT)

    if (userWithTeam?.teamId) {
      await db.delete(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, userWithTeam.teamId)))
    }

    await db.update(users).set({ deletedAt: new Date(), email: `${user.email}-${user.id}-deleted` }).where(eq(users.id, user.id))
    const { error: deleteError } = await supa.auth.admin.deleteUser(user.supabaseId)
    if (deleteError) console.error('Failed to delete user from Supabase:', deleteError)

    await supa.auth.signOut()
    redirect('/sign-in')
  }
)

// -------------------- UPDATE ACCOUNT --------------------
const updateAccountSchema = z.object({ name: z.string().min(1).max(100), email: z.string().email() })

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data
    const supa = await createServerSupabase()
    const userWithTeam = await getUserWithTeam(user.id)

    if (email !== user.email) {
      const { error: emailError } = await supa.auth.updateUser({ email })
      if (emailError) return { error: emailError.message }
    }

    const { error: metadataError } = await supa.auth.updateUser({ data: { full_name: name } })
    if (metadataError) return { error: metadataError.message }

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ])

    return { success: 'Account updated successfully.' }
  }
)

// -------------------- TEAM MEMBER MANAGEMENT --------------------
const removeTeamMemberSchema = z.object({ memberId: z.string().uuid() })
export const removeTeamMember = validatedActionWithUser(removeTeamMemberSchema, async (data, _, user) => {
  const { memberId } = data
  const userWithTeam = await getUserWithTeam(user.id)
  if (!userWithTeam?.teamId) return { error: 'User is not part of a team' }

  await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, userWithTeam.teamId)))
  await logActivity(userWithTeam.teamId, user.id, ActivityType.REMOVE_TEAM_MEMBER)

  return { success: 'Team member removed successfully' }
})

const inviteTeamMemberSchema = z.object({ email: z.string().email(), role: z.enum(['member', 'owner']) })
export const inviteTeamMember = validatedActionWithUser(inviteTeamMemberSchema, async (data, _, user) => {
  const { email, role } = data
  const userWithTeam = await getUserWithTeam(user.id)
  if (!userWithTeam?.teamId) return { error: 'User is not part of a team' }

  const existingMember = await db.select().from(users).leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(and(eq(users.email, email), eq(teamMembers.teamId, userWithTeam.teamId))).limit(1)
  if (existingMember.length > 0) return { error: 'User is already a member' }

  const existingInvitation = await db.select().from(invitations)
    .where(and(eq(invitations.email, email), eq(invitations.teamId, userWithTeam.teamId), eq(invitations.status, 'pending'))).limit(1)
  if (existingInvitation.length > 0) return { error: 'Invitation already sent' }

  await db.insert(invitations).values({
    id: crypto.randomUUID(),
    teamId: userWithTeam.teamId,
    email,
    role,
    invitedBy: user.id,
    status: 'pending'
  } as any)

  await logActivity(userWithTeam.teamId, user.id, ActivityType.INVITE_TEAM_MEMBER)
  return { success: 'Invitation sent successfully' }
})
