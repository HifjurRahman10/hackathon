import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { activityLogs, teamMembers, teams, users, chats, scenes } from './schema';
import type { User, Chat, Scene } from './schema';
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

export async function getUserWithTeam(userId: string): Promise<UserWithTeam | null> {
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

// New queries for chats and scenes
export async function getChatsForUser(userId: string) {
  return await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.createdAt));
}

export async function getChatWithScenes(chatId: number) {
  const [chat] = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  if (!chat) return null;

  // FIXED: Renamed variable to 'sceneList' to avoid conflict with table name 'scenes'
  const sceneList = await db
    .select()
    .from(scenes)
    .where(eq(scenes.chatId, chatId))
    .orderBy(scenes.sceneNumber);

  return {
    ...chat,
    scenes: sceneList
  };
}

export async function createChat(userId: string, title: string) {
  const [newChat] = await db
    .insert(chats)
    .values({
      userId,
      title,
    })
    .returning();

  return newChat;
}

export async function createScene(chatId: number, sceneData: {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  imageUrl?: string;
}) {
  const [newScene] = await db
    .insert(scenes)
    .values({
      chatId,
      ...sceneData,
    })
    .returning();

  return newScene;
}

export async function updateChat(chatId: number, updates: Partial<Chat>) {
  await db
    .update(chats)
    .set(updates)
    .where(eq(chats.id, chatId));
}

export async function deleteChat(chatId: number) {
  await db
    .delete(chats)
    .where(eq(chats.id, chatId));
}
