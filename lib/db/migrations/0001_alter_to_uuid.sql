-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

BEGIN;

-- 1. Add temporary UUID columns for all ID fields (auto-filled)
ALTER TABLE users ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE teams ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE chats ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE messages ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE scenes ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE team_members ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE activity_logs ADD COLUMN id_new uuid DEFAULT gen_random_uuid();
ALTER TABLE invitations ADD COLUMN id_new uuid DEFAULT gen_random_uuid();

-- 2. Add temporary UUID FK columns
ALTER TABLE chats ADD COLUMN user_id_new uuid;
ALTER TABLE messages ADD COLUMN chat_id_new uuid, ADD COLUMN user_id_new uuid;
ALTER TABLE scenes ADD COLUMN chat_id_new uuid;
ALTER TABLE team_members ADD COLUMN user_id_new uuid, ADD COLUMN team_id_new uuid;
ALTER TABLE activity_logs ADD COLUMN team_id_new uuid, ADD COLUMN user_id_new uuid;
ALTER TABLE invitations ADD COLUMN team_id_new uuid, ADD COLUMN invited_by_new uuid;

-- 3. Map FK relationships using old IDs
UPDATE chats SET user_id_new = u.id_new
FROM users u
WHERE chats.user_id = u.id;

UPDATE messages SET chat_id_new = c.id_new, user_id_new = u.id_new
FROM chats c, users u
WHERE messages.chat_id = c.id AND messages.user_id = u.id;

UPDATE scenes SET chat_id_new = c.id_new
FROM chats c
WHERE scenes.chat_id = c.id;

UPDATE team_members SET user_id_new = u.id_new, team_id_new = t.id_new
FROM users u, teams t
WHERE team_members.user_id = u.id AND team_members.team_id = t.id;

UPDATE activity_logs SET team_id_new = t.id_new, user_id_new = u.id_new
FROM teams t, users u
WHERE activity_logs.team_id = t.id AND activity_logs.user_id = u.id;

UPDATE invitations SET team_id_new = t.id_new, invited_by_new = u.id_new
FROM teams t, users u
WHERE invitations.team_id = t.id AND invitations.invited_by = u.id;

-- 4. Drop all foreign key constraints
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_user_id_users_id_fk;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_chat_id_chats_id_fk;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_user_id_users_id_fk;
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_chat_id_chats_id_fk;
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_user_id_users_id_fk;
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_team_id_teams_id_fk;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_team_id_teams_id_fk;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_users_id_fk;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_team_id_teams_id_fk;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invited_by_users_id_fk;

-- 5. Drop primary key constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_pkey;
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_pkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_pkey;
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_pkey;
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_pkey;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_pkey;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_pkey;

-- 6. Drop old ID columns
ALTER TABLE users DROP COLUMN id;
ALTER TABLE teams DROP COLUMN id;
ALTER TABLE chats DROP COLUMN id, DROP COLUMN user_id;
ALTER TABLE messages DROP COLUMN id, DROP COLUMN chat_id, DROP COLUMN user_id;
ALTER TABLE scenes DROP COLUMN id, DROP COLUMN chat_id;
ALTER TABLE team_members DROP COLUMN id, DROP COLUMN user_id, DROP COLUMN team_id;
ALTER TABLE activity_logs DROP COLUMN id, DROP COLUMN team_id, DROP COLUMN user_id;
ALTER TABLE invitations DROP COLUMN id, DROP COLUMN team_id, DROP COLUMN invited_by;

-- 7. Rename new columns
ALTER TABLE users RENAME COLUMN id_new TO id;
ALTER TABLE teams RENAME COLUMN id_new TO id;
ALTER TABLE chats RENAME COLUMN id_new TO id;
ALTER TABLE chats RENAME COLUMN user_id_new TO user_id;
ALTER TABLE messages RENAME COLUMN id_new TO id;
ALTER TABLE messages RENAME COLUMN chat_id_new TO chat_id;
ALTER TABLE messages RENAME COLUMN user_id_new TO user_id;
ALTER TABLE scenes RENAME COLUMN id_new TO id;
ALTER TABLE scenes RENAME COLUMN chat_id_new TO chat_id;
ALTER TABLE team_members RENAME COLUMN id_new TO id;
ALTER TABLE team_members RENAME COLUMN user_id_new TO user_id;
ALTER TABLE team_members RENAME COLUMN team_id_new TO team_id;
ALTER TABLE activity_logs RENAME COLUMN id_new TO id;
ALTER TABLE activity_logs RENAME COLUMN team_id_new TO team_id;
ALTER TABLE activity_logs RENAME COLUMN user_id_new TO user_id;
ALTER TABLE invitations RENAME COLUMN id_new TO id;
ALTER TABLE invitations RENAME COLUMN team_id_new TO team_id;
ALTER TABLE invitations RENAME COLUMN invited_by_new TO invited_by;

-- 8. Set NOT NULL constraints
ALTER TABLE users ALTER COLUMN id SET NOT NULL;
ALTER TABLE teams ALTER COLUMN id SET NOT NULL;
ALTER TABLE chats ALTER COLUMN id SET NOT NULL;
ALTER TABLE chats ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN chat_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE scenes ALTER COLUMN id SET NOT NULL;
ALTER TABLE scenes ALTER COLUMN chat_id SET NOT NULL;
ALTER TABLE team_members ALTER COLUMN id SET NOT NULL;
ALTER TABLE team_members ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE team_members ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invitations ALTER COLUMN id SET NOT NULL;
ALTER TABLE invitations ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE invitations ALTER COLUMN invited_by SET NOT NULL;

-- 9. Re-add primary keys
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE chats ADD CONSTRAINT chats_pkey PRIMARY KEY (id);
ALTER TABLE messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE scenes ADD CONSTRAINT scenes_pkey PRIMARY KEY (id);
ALTER TABLE team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
ALTER TABLE invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

-- 10. Re-add foreign key constraints
ALTER TABLE chats ADD CONSTRAINT chats_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_chat_id_chats_id_fk FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE scenes ADD CONSTRAINT scenes_chat_id_chats_id_fk FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT team_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE team_members ADD CONSTRAINT team_members_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE invitations ADD CONSTRAINT invitations_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_users_id_fk FOREIGN KEY (invited_by) REFERENCES users(id);

-- 11. Optional: Recreate indexes on foreign keys for performance
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_chat_id ON scenes(chat_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_team_id ON invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by);

COMMIT;
