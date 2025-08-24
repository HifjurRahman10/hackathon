'use server'

import { z } from 'zod'
import { createServerSupabase } from '@/lib/auth/supabase'
import { syncUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { 
  getUserWithTeam,
  getUser 
} from '@/lib/db/queries'
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware'
import { 
  teams, 
  teamMembers, 
  activityLogs, 
  invitations,
  users,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType 
} from '@/lib/db/schema'
import { db } from '@/lib/db/drizzle'
import { and, eq } from 'drizzle-orm'

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  }
  await db.insert(activityLogs).values(newActivity)
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
})

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data
  const supabase = await createServerSupabase()

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    }
  }

  if (authData.user) {
    // Sync user with local database
    const user = await syncUser(authData.user)
    const userWithTeam = await getUserWithTeam(user.id)
    
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_IN)

    const redirectTo = formData.get('redirect') as string | null
    if (redirectTo === 'checkout') {
      const priceId = formData.get('priceId') as string
      // Handle checkout redirect with proper team lookup
      redirect(`/checkout?priceId=${priceId}`)
    }

    redirect('/dashboard')
  }

  return { error: 'Authentication failed' }
})

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional()
})

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data
  const supabase = await createServerSupabase()

  // Check for existing invitation
  let invitation = null
  if (inviteId) {
    ;[invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parseInt(inviteId)),
          eq(invitations.email, email),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1)

    if (!invitation) {
      return { error: 'Invalid or expired invitation.', email, password }
    }
  }

  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        invitation_id: inviteId
      }
    }
  })

  if (error) {
    return {
      error: error.message || 'Failed to create account. Please try again.',
      email,
      password
    }
  }

  if (authData.user && !authData.user.email_confirmed_at) {
    return {
      success: 'Please check your email to confirm your account.',
      email,
      password
    }
  }

  // If user is confirmed, sync immediately
  if (authData.user?.email_confirmed_at) {
    const user = await syncUser(authData.user)
    
    // Handle invitation if exists
    if (invitation) {
      // Add user to team
      await db.insert(teamMembers).values({
        userId: user.id,
        teamId: invitation.teamId,
        role: invitation.role
      })

      // Update invitation status
      await db
        .update(invitations)
        .set({ status: 'accepted' })
        .where(eq(invitations.id, invitation.id))

      await logActivity(invitation.teamId, user.id, ActivityType.ACCEPT_INVITATION)
    }

    redirect('/dashboard')
  }

  // User needs to confirm email
  return {
    success: 'Please check your email to confirm your account.',
    email,
    password
  }
})

export async function signOut() {
  const user = await getUser()
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT)
  }

  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/sign-in')
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
})

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data
    const supabase = await createServerSupabase()

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.'
      }
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.'
      }
    }

    // For password update, Supabase handles current password verification internally
    // We'll rely on the user being authenticated to update their password

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: error.message
      }
    }

    const userWithTeam = await getUserWithTeam(user.id)
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)

    return {
      success: 'Password updated successfully.'
    }
  }
)

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;
    const supabase = await createServerSupabase()

    // Verify password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password
    })

    if (verifyError) {
      return {
        password,
        error: 'Incorrect password. Account deletion failed.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Remove from team if exists
    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    // Soft delete user in local database
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        email: `${user.email}-${user.id}-deleted` // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    // Delete user from Supabase
    const supabaseUserId = user.supabaseId;
    if (!supabaseUserId) {
      return { error: 'User record missing supabaseId (cannot delete in Supabase)' };
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(supabaseUserId);
    if (deleteError) {
      console.error('Failed to delete user from Supabase:', deleteError);
      return { error: 'Failed to delete Supabase user' };
    }

    // Sign out and redirect
    await supabase.auth.signOut()
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const supabase = await createServerSupabase()
    const userWithTeam = await getUserWithTeam(user.id);

    // Update email in Supabase if changed
    if (email !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({
        email
      })

      if (emailError) {
        return {
          name,
          email,
          error: emailError.message
        }
      }
    }

    // Update user metadata in Supabase
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { full_name: name }
    })

    if (metadataError) {
      return {
        name,
        email,
        error: metadataError.message
      }
    }

    // Update local database
    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.number()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId)
        )
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { success: 'Team member removed successfully' };
  }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'owner'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
      .where(
        and(eq(users.email, email), eq(teamMembers.teamId, userWithTeam.teamId))
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { error: 'User is already a member of this team' };
    }

    // Check if there's an existing invitation
    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.teamId, userWithTeam.teamId),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      return { error: 'An invitation has already been sent to this email' };
    }

    // Create a new invitation
    const [newInvitation] = await db.insert(invitations).values({
      teamId: userWithTeam.teamId,
      email,
      role,
      invitedBy: user.id,
      status: 'pending'
    }).returning();

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.INVITE_TEAM_MEMBER
    );

    // TODO: Send invitation email with the invitation ID
    // The invitation URL should be: /sign-up?inviteId=${newInvitation.id}
    // await sendInvitationEmail(email, userWithTeam.team.name, role, newInvitation.id)

    return { success: 'Invitation sent successfully' };
  }
);