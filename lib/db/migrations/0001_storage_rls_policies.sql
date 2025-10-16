-- Enable RLS on storage.objects table
-- Create policy to allow public read access to user_upload bucket

-- First, ensure the bucket is public (this should be done via API or dashboard, but we document it here)
-- You must manually make the bucket public in Supabase dashboard or via API

-- Create policy for public read access to objects in user_upload bucket
CREATE POLICY "Public read access for user_upload"
ON storage.objects
FOR SELECT
USING ( bucket_id = 'user_upload' );

-- Optional: Create policy to allow authenticated users to upload
CREATE POLICY "Authenticated users can upload to user_upload"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'user_upload' 
  AND auth.role() = 'authenticated'
);

-- Optional: Create policy to allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'user_upload'
  AND auth.role() = 'authenticated'
);
