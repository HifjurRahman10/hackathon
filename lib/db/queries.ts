import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { activityLogs, teamMembers, teams, users } from './schema';
import type { User } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import type { Session } from '@supabase/supabase-js';
import { ensureSupabaseIdColumn } from './setup';

export async function getUser(): Promise<User | null> {
  await ensureSupabaseIdColumn();

  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie?.value) return null;

  const sessionData = await verifyToken(sessionCookie.value);
  if (!sessionData?.user?.id) return null;
  const supabaseId = sessionData.user.id;

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.supabaseId, supabaseId), isNull(users.deletedAt)))
      .limit(1);
    if (user) return user;
  } catch (e: any) {
    if (e.code !== '42703') throw e;
    // Column absent: fallback email-based (unsafe but temporary)
  }

  return null;
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return team || null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

type UserWithTeam = {
  user: User;
  teamId: number | null;
};

export async function getUserWithTeam(userId: number): Promise<UserWithTeam | null> {
  const [result] = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result || null;
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      stripeCustomerId: teams.stripeCustomerId,
      stripeSubscriptionId: teams.stripeSubscriptionId,
      planName: teams.planName,
      subscriptionStatus: teams.subscriptionStatus
    })
    .from(teams)
    .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  if (!team) return null;

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email
    })
    .from(users)
    .innerJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, team.id));

  return {
    ...team,
    teamMembers: members
  };
}
