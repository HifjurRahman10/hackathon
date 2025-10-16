-- Storage RLS Policies for user_upload bucket
-- This bucket is PRIVATE with RLS policies for user-specific access

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read access for user_upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to user_upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Users can read their own files (path starts with their user ID)
CREATE POLICY "Users can read own files in user_upload"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'user_upload'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload to own folder in user_upload"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'user_upload' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own files
CREATE POLICY "Users can update own files in user_upload"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'user_upload'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "Users can delete own files in user_upload"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'user_upload'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
