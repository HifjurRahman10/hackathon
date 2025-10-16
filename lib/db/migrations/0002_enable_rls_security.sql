-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (supabase_id = auth.uid()::text);

CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (supabase_id = auth.uid()::text);

-- Chats table policies
CREATE POLICY "Users can view own chats"
ON chats FOR SELECT
USING (
  user_id IN (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create own chats"
ON chats FOR INSERT
WITH CHECK (
  user_id IN (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can delete own chats"
ON chats FOR DELETE
USING (
  user_id IN (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can update own chats"
ON chats FOR UPDATE
USING (
  user_id IN (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  )
);

-- Characters table policies
CREATE POLICY "Users can view characters in own chats"
ON characters FOR SELECT
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create characters in own chats"
ON characters FOR INSERT
WITH CHECK (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can update characters in own chats"
ON characters FOR UPDATE
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can delete characters in own chats"
ON characters FOR DELETE
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

-- Scenes table policies
CREATE POLICY "Users can view scenes in own chats"
ON scenes FOR SELECT
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create scenes in own chats"
ON scenes FOR INSERT
WITH CHECK (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can update scenes in own chats"
ON scenes FOR UPDATE
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can delete scenes in own chats"
ON scenes FOR DELETE
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

-- Scene environments table policies
CREATE POLICY "Users can view environments in own chats"
ON scene_environments FOR SELECT
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create environments in own chats"
ON scene_environments FOR INSERT
WITH CHECK (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can update environments in own chats"
ON scene_environments FOR UPDATE
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

-- Messages table policies
CREATE POLICY "Users can view messages in own chats"
ON messages FOR SELECT
USING (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create messages in own chats"
ON messages FOR INSERT
WITH CHECK (
  chat_id IN (
    SELECT c.id FROM chats c
    INNER JOIN users u ON c.user_id = u.id
    WHERE u.supabase_id = auth.uid()::text
  )
);

-- Team policies
CREATE POLICY "Users can view their teams"
ON teams FOR SELECT
USING (
  id IN (
    SELECT team_id FROM team_members
    WHERE user_id IN (
      SELECT id FROM users WHERE supabase_id = auth.uid()::text
    )
  )
);

CREATE POLICY "Team members can update their teams"
ON teams FOR UPDATE
USING (
  id IN (
    SELECT team_id FROM team_members
    WHERE user_id IN (
      SELECT id FROM users WHERE supabase_id = auth.uid()::text
    )
    AND role IN ('owner', 'admin')
  )
);

-- Team members policies
CREATE POLICY "Users can view team members of their teams"
ON team_members FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id IN (
      SELECT id FROM users WHERE supabase_id = auth.uid()::text
    )
  )
);

-- Invitations policies
CREATE POLICY "Users can view invitations for their teams"
ON invitations FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id IN (
      SELECT id FROM users WHERE supabase_id = auth.uid()::text
    )
  )
  OR email IN (
    SELECT email FROM users WHERE supabase_id = auth.uid()::text
  )
);

-- Activity logs policies
CREATE POLICY "Users can view activity logs for their teams"
ON activity_logs FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id IN (
      SELECT id FROM users WHERE supabase_id = auth.uid()::text
    )
  )
);
