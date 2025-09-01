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