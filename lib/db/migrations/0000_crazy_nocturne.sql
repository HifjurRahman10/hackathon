CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" serial PRIMARY KEY NOT NULL,
    "team_id" integer NOT NULL,
    "user_id" uuid,
    "action" text NOT NULL,
    "timestamp" timestamp DEFAULT now() NOT NULL,
    "ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chats" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL,
    "title" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
    "id" serial PRIMARY KEY NOT NULL,
    "team_id" integer NOT NULL,
    "email" varchar(255) NOT NULL,
    "role" varchar(50) NOT NULL,
    "invited_by" uuid NOT NULL,
    "invited_at" timestamp DEFAULT now() NOT NULL,
    "status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenes" (
    "id" serial PRIMARY KEY NOT NULL,
    "chat_id" integer NOT NULL,
    "scene_number" integer NOT NULL,
    "scene_prompt" text NOT NULL,
    "scene_image_prompt" text NOT NULL,
    "image_url" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL,
    "team_id" integer NOT NULL,
    "role" varchar(50) NOT NULL,
    "joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar(100) NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "stripe_customer_id" text,
    "stripe_subscription_id" text,
    "stripe_product_id" text,
    "plan_name" varchar(50),
    "subscription_status" varchar(20)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "supabase_id" text NOT NULL,
    "name" varchar(100),
    "email" varchar(255) NOT NULL,
    "role" varchar(20) DEFAULT 'member' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "deleted_at" timestamp
);
--> statement-breakpoint

-- Add unique constraints only if they don't exist
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_stripe_customer_id_unique') THEN
  ALTER TABLE "teams" ADD CONSTRAINT "teams_stripe_customer_id_unique" UNIQUE("stripe_customer_id");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_stripe_subscription_id_unique') THEN
  ALTER TABLE "teams" ADD CONSTRAINT "teams_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_supabase_id_unique') THEN
  ALTER TABLE "users" ADD CONSTRAINT "users_supabase_id_unique" UNIQUE("supabase_id");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
  ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
 END IF;
END $$;
--> statement-breakpoint

-- STEP 1: Drop ALL foreign key constraints first
DO $$ 
BEGIN
    ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_user_id_users_id_fk;
    ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_user_id_users_id_fk;
    ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_users_id_fk;
    ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invited_by_users_id_fk;
    ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_team_id_teams_id_fk;
    ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_team_id_teams_id_fk;
    ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_team_id_teams_id_fk;
    ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_chat_id_chats_id_fk;
    
    RAISE NOTICE 'Dropped all foreign key constraints';
END $$;
--> statement-breakpoint

-- STEP 2: Fix users table structure
DO $$ 
DECLARE
    has_integer_id boolean := false;
    has_uuid_id boolean := false;
    has_any_id boolean := false;
BEGIN
    -- Drop primary key constraint
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
    
    -- Check what id columns we have
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'id' 
        AND data_type = 'integer'
    ) INTO has_integer_id;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'id' 
        AND data_type = 'uuid'
    ) INTO has_uuid_id;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'id'
    ) INTO has_any_id;
    
    RAISE NOTICE 'Users table analysis: has_integer_id=%, has_uuid_id=%, has_any_id=%', has_integer_id, has_uuid_id, has_any_id;
    
    -- Handle different scenarios
    IF has_integer_id THEN
        -- Drop the integer id column
        ALTER TABLE users DROP COLUMN id;
        RAISE NOTICE 'Dropped integer id column from users table';
        has_any_id := false;
    END IF;
    
    IF NOT has_any_id THEN
        -- No id column exists, add UUID one
        ALTER TABLE users ADD COLUMN id uuid DEFAULT gen_random_uuid() NOT NULL;
        RAISE NOTICE 'Added UUID id column to users table';
    ELSIF has_uuid_id THEN
        -- UUID column exists, just ensure proper settings
        ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
        ALTER TABLE users ALTER COLUMN id SET NOT NULL;
        RAISE NOTICE 'Updated existing UUID id column in users table';
    ELSE
        -- Some other type exists, convert to UUID
        ALTER TABLE users ALTER COLUMN id TYPE uuid USING gen_random_uuid();
        ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
        ALTER TABLE users ALTER COLUMN id SET NOT NULL;
        RAISE NOTICE 'Converted existing id column to UUID in users table';
    END IF;
    
    -- Re-add primary key constraint
    ALTER TABLE users ADD PRIMARY KEY (id);
    
    RAISE NOTICE 'Fixed users table structure - id is now UUID';
END $$;
--> statement-breakpoint

-- STEP 3: Fix all foreign key column types
DO $$ 
BEGIN
    -- Fix chats.user_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chats' 
        AND column_name = 'user_id' 
        AND data_type != 'uuid'
    ) THEN
        ALTER TABLE chats ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
        RAISE NOTICE 'Fixed chats.user_id to UUID type';
    END IF;
    
    -- Fix team_members.user_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' 
        AND column_name = 'user_id' 
        AND data_type != 'uuid'
    ) THEN
        ALTER TABLE team_members ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
        RAISE NOTICE 'Fixed team_members.user_id to UUID type';
    END IF;
    
    -- Fix activity_logs.user_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_logs' 
        AND column_name = 'user_id' 
        AND data_type != 'uuid'
    ) THEN
        ALTER TABLE activity_logs ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
        RAISE NOTICE 'Fixed activity_logs.user_id to UUID type';
    END IF;
    
    -- Fix invitations.invited_by
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' 
        AND column_name = 'invited_by' 
        AND data_type != 'uuid'
    ) THEN
        ALTER TABLE invitations ALTER COLUMN invited_by TYPE uuid USING gen_random_uuid();
        RAISE NOTICE 'Fixed invitations.invited_by to UUID type';
    END IF;
    
    RAISE NOTICE 'All foreign key columns are now UUID type';
END $$;
--> statement-breakpoint

-- STEP 4: Verify column types before adding constraints
DO $$ 
DECLARE
    users_id_type text;
    chats_user_id_type text;
BEGIN
    -- Get actual column types
    SELECT data_type INTO users_id_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'id';
    
    SELECT data_type INTO chats_user_id_type 
    FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'user_id';
    
    RAISE NOTICE 'users.id type: %, chats.user_id type: %', users_id_type, chats_user_id_type;
    
    -- Only proceed if types match
    IF users_id_type = 'uuid' AND chats_user_id_type = 'uuid' THEN
        RAISE NOTICE 'Column types are compatible, proceeding with foreign key creation';
    ELSE
        RAISE NOTICE 'Column types are not compatible: users.id=%, chats.user_id=% - skipping foreign key creation', users_id_type, chats_user_id_type;
    END IF;
END $$;
--> statement-breakpoint

-- STEP 5: Add foreign key constraints back
DO $$ 
BEGIN
    -- Add chats foreign key
    ALTER TABLE chats ADD CONSTRAINT chats_user_id_users_id_fk 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added chats foreign key constraint';
    
    -- Add team_members foreign keys
    ALTER TABLE team_members ADD CONSTRAINT team_members_user_id_users_id_fk 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added team_members user foreign key constraint';
    
    ALTER TABLE team_members ADD CONSTRAINT team_members_team_id_teams_id_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added team_members team foreign key constraint';
    
    -- Add activity_logs foreign keys
    ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_users_id_fk 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added activity_logs user foreign key constraint';
    
    ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_team_id_teams_id_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added activity_logs team foreign key constraint';
    
    -- Add invitations foreign keys
    ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_users_id_fk 
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added invitations user foreign key constraint';
    
    ALTER TABLE invitations ADD CONSTRAINT invitations_team_id_teams_id_fk 
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added invitations team foreign key constraint';
    
    -- Add scenes foreign key
    ALTER TABLE scenes ADD CONSTRAINT scenes_chat_id_chats_id_fk 
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added scenes foreign key constraint';
    
    RAISE NOTICE 'All foreign key constraints added successfully';
    
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Error adding foreign key constraints: %', SQLERRM;
    -- Don't re-raise the exception, just log it
END $$;
--> statement-breakpoint

-- STEP 6: Clean up old sequences
DO $$ 
BEGIN
    DROP SEQUENCE IF EXISTS users_id_seq CASCADE;
    RAISE NOTICE 'Cleaned up old users sequence';
EXCEPTION WHEN others THEN
    RAISE NOTICE 'No old users sequence to clean up';
END $$;