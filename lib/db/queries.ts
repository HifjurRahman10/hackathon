import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { activityLogs, teamMembers, teams, users } from './schema';
import type { User } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import type { Session } from '@supabase/supabase-js';

export async function getUser(): Promise<User | null> {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie?.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (!sessionData?.user?.id) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.supabaseId, sessionData.user.id),
      isNull(users.deletedAt)
    ))
    .limit(1);

  return user || null;
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
  teamId: string, // FIX: was number, ids are uuid strings now
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
  teamId: string | null; // FIX: uuid
};

export async function getUserWithTeam(userId: string) { // FIX: was number
  const result = await db
    .select({
      userId: users.id,
      teamId: teams.id,
      teamName: teams.name,
      stripeCustomerId: teams.stripeCustomerId,
      stripeSubscriptionId: teams.stripeSubscriptionId,
      planName: teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] || null;
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
    .where(eq(teamMembers.userId, user.id)) // user.id is uuid now
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
