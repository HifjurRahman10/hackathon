import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  uuid,
  primaryKey
} from 'drizzle-orm/pg-core';

// -------------------- Users --------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  supabaseId: text('supabase_id').notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// -------------------- Teams --------------------
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeProductId: varchar('stripe_product_id', { length: 255 }),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

// -------------------- Team Members --------------------
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

// -------------------- Invitations --------------------
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  invitedAt: timestamp('invited_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

// -------------------- Chats --------------------
export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -------------------- Messages --------------------
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -------------------- Scenes --------------------
export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  sceneNumber: integer('scene_number').notNull(),
  sceneImagePrompt: text('scene_image_prompt'),
  sceneVideoPrompt: text('scene_video_prompt'),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const finalVideo = pgTable('final_video',{
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  videoUrl: text('video_url'),
});

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  characterName: varchar('character_name', { length: 100 }).notNull(),
  characterImagePrompt: text('character_image_prompt'),
  characterImageUrl: text('character_image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sceneEnvironments = pgTable('scene_environments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  environmentImagePrompt: text('environment_image_prompt'),
  environmentImageUrl: text('environment_image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sceneCharacters = pgTable('scene_characters', {
  sceneId: uuid('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.sceneId, table.characterId] })
}));

// -------------------- Activity Logs --------------------
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 255 }).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

// -------------------- Relations --------------------
export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  chats: many(chats),
  messages: many(messages),
  activityLogs: many(activityLogs),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitations: many(invitations),
  activityLogs: many(activityLogs),
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

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(messages),
  scenes: many(scenes),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  chat: one(chats, {
    fields: [scenes.chatId],
    references: [chats.id],
  }),
  characters: many(sceneCharacters),
  environment: one(sceneEnvironments, {
    fields: [scenes.chatId],
    references: [sceneEnvironments.chatId]
  })
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  chat: one(chats, {
    fields: [characters.chatId],
    references: [chats.id],
  }),
  scenes: many(sceneCharacters)
}));

export const sceneEnvironmentsRelations = relations(sceneEnvironments, ({ one }) => ({
  chat: one(chats, {
    fields: [sceneEnvironments.chatId],
    references: [chats.id],
  })
}));

export const sceneCharactersRelations = relations(sceneCharacters, ({ one }) => ({
  scene: one(scenes, {
    fields: [sceneCharacters.sceneId],
    references: [scenes.id],
  }),
  character: one(characters, {
    fields: [sceneCharacters.characterId],
    references: [characters.id],
  })
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

// -------------------- Types --------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type SceneCharacter = typeof sceneCharacters.$inferSelect;
export type NewSceneCharacter = typeof sceneCharacters.$inferInsert;

// -------------------- Enums --------------------
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

