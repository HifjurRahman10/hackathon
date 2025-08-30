CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "chat_id" integer NOT NULL REFERENCES "public"."chats"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id"),
  "content" text NOT NULL,
  "role" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);