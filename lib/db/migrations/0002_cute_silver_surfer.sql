CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "invited_by" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Inspect constraints (run separately in SQL editor if unsure):
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- JOIN pg_class t ON t.oid = c.conrelid
-- WHERE t.relname = 'chats';

-- Drop possible unique constraints (keep those that actually exist)
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_user_id_key;
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_user_id_title_key;
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_user_id_unique;
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_user_id_title_unique;