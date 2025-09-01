ALTER TABLE "teams" DROP CONSTRAINT "teams_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "action" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "scenes" ALTER COLUMN "scene_prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ALTER COLUMN "scene_image_prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "stripe_customer_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "stripe_subscription_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "stripe_product_id" SET DATA TYPE varchar(255);

-- DROP the bad/self FK
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- OPTION A (simplest): stop here (no FK). Uncomment ONLY if you want no FK.
-- -- Done.

-- OPTION B (recommended): add correct FK to auth.users(id)
-- NOTE: auth.users lives in the auth schema managed by Supabase.
ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users (id)
  ON DELETE CASCADE;