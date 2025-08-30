import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Fixed users table with proper UUID handling for Supabase
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`), // FIXED: Use sql template
  supabaseId: text('supabase_id').notNull().unique(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

// Fixed foreign keys to use uuid
export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id), // FIXED: Proper UUID reference
  teamId: integer('team_id').notNull().references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  userId: uuid('user_id').references(() => users.id), // FIXED: Proper UUID reference
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id), // FIXED: Proper UUID reference
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

// New chats table - FIXED: Proper UUID reference
export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id), // FIXED: Proper UUID reference
  title: text('title'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// New scenes table
export const scenes = pgTable('scenes', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  sceneNumber: integer('scene_number').notNull(),
  scenePrompt: text('scene_prompt').notNull(),
  sceneImagePrompt: text('scene_image_prompt').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Relations for new tables
export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  scenes: many(scenes),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
  chat: one(chats, {
    fields: [scenes.chatId],
    references: [chats.id],
  }),
}));

// Existing relations...
export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  chats: many(chats), // Added relation to chats
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

// Type exports for new tables
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;

// Existing type exports...
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
