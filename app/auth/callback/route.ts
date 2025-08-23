import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth/supabase'
import { syncUser } from '@/lib/auth/session'
import { db } from '@/lib/db/drizzle'
import { invitations, teamMembers, activityLogs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ActivityType } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabase()
    
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Error exchanging code for session:', error)
        return NextResponse.redirect(new URL('/sign-in?error=auth-callback-error', request.url))
      }

      if (data.user) {
        // Sync user with local database
        const user = await syncUser(data.user)
        
        // Check for pending invitations
        const [invitation] = await db
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.email, user.email),
              eq(invitations.status, 'pending')
            )
          )
          .limit(1)

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

          // Log activity
          await db.insert(activityLogs).values({
            teamId: invitation.teamId,
            userId: user.id,
            action: ActivityType.ACCEPT_INVITATION,
            ipAddress: request.ip || ''
          })
        }

        // Log sign up activity
        const [userTeam] = await db
          .select({ teamId: teamMembers.teamId })
          .from(teamMembers)
          .where(eq(teamMembers.userId, user.id))
          .limit(1)

        if (userTeam) {
          await db.insert(activityLogs).values({
            teamId: userTeam.teamId,
            userId: user.id,
            action: ActivityType.SIGN_UP,
            ipAddress: request.ip || ''
          })
        }
      }
      
      // Redirect to the next URL
      return NextResponse.redirect(new URL(next, request.url))
    } catch (error) {
      console.error('Unexpected error during auth callback:', error)
      return NextResponse.redirect(new URL('/sign-in?error=callback-error', request.url))
    }
  }

  // No code provided, redirect to sign in
  return NextResponse.redirect(new URL('/sign-in', request.url))
}