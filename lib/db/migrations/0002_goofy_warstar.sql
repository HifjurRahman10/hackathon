CREATE TABLE "final_video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"video_url" text
);
--> statement-breakpoint
ALTER TABLE "final_video" ADD CONSTRAINT "final_video_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;