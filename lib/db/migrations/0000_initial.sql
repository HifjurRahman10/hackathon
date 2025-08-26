-- Merged initial migration (combines previous two files)
-- NOTE: Use this only after wiping old migration meta, or on a fresh DB.
-- If tables already exist in production, do NOT run this blindly; instead
-- create incremental ALTER TABLE migrations.

-- USERS
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "name" varchar(100),
  "email" varchar(255) NOT NULL,
  "password_hash" text,                -- optional auth hash (nullable if using Supabase Auth)
  "role" varchar(20) DEFAULT 'member' NOT NULL,
  "supabase_id" text UNIQUE,           -- Supabase auth user id
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- TEAMS
CREATE TABLE IF NOT EXISTS "teams" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_product_id" text,
  "plan_name" varchar(50),
  "subscription_status" varchar(20),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "teams_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
  CONSTRAINT "teams_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);

-- TEAM MEMBERS
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(50) DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_members_team_user_unique" UNIQUE ("team_id","user_id")
);

-- INVITATIONS
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL,
  "invited_by" integer NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "invited_at" timestamp DEFAULT now() NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL
);

-- ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" serial PRIMARY KEY,
  "team_id" integer REFERENCES "teams"("id") ON DELETE SET NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "ip_address" varchar(45),
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- INDEXES
CREATE INDEX IF NOT EXISTS "users_supabase_id_idx" ON "users" ("supabase_id");
CREATE INDEX IF NOT EXISTS "activity_logs_user_idx" ON "activity_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "activity_logs_team_idx" ON "activity_logs" ("team_id");
CREATE INDEX IF NOT EXISTS "team_members_user_idx" ON "team_members" ("user_id");
CREATE INDEX IF NOT EXISTS "team_members_team_idx" ON "team_members" ("team_id");

-- TRIGGERS FOR updated_atCREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_users_updated_at'
  ) THEN
    CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW
    EXECUTE PROCEDURE set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_teams_updated_at'
  ) THEN
    CREATE TRIGGER set_teams_updated_at
    BEFORE UPDATE ON "teams"
    FOR EACH ROW
    EXECUTE PROCEDURE set_updated_at();
  END IF;
END