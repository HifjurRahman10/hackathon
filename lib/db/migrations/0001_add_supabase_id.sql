ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "supabase_id" text UNIQUE;
-- (Optional) backfill from email or existing auth column if you had one:
-- UPDATE "users" SET "supabase_id" = some_existing_column WHERE "supabase_id" IS NULL;