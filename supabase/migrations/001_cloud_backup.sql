-- Migration 001: Cloud Backup Architecture (Phase 1A)
-- Description: Creates snapshot-based public.user_backups table, RLS policies, 
-- private user-backups Storage bucket, and user-isolated Storage RLS policies.

-- ============================================================================
-- 1. DATABASE SCHEMA: public.user_backups
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  app_version TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments on table & columns for clarity
COMMENT ON TABLE public.user_backups IS 'Stores self-contained JSON snapshots of user IPOVault-Offline data.';
COMMENT ON COLUMN public.user_backups.owner_id IS 'References the Supabase auth.users ID who owns this backup.';
COMMENT ON COLUMN public.user_backups.backup_version IS 'Snapshot backup format version (defaults to 1).';
COMMENT ON COLUMN public.user_backups.schema_version IS 'Local SQLite database schema version at time of backup (defaults to 1).';
COMMENT ON COLUMN public.user_backups.app_version IS 'Mobile app version string (e.g. 2.0.2).';
COMMENT ON COLUMN public.user_backups.payload IS 'Full exported JSON payload containing banks, users, ipos, and applications.';

-- Indexes for efficient querying by user and date
CREATE INDEX IF NOT EXISTS idx_user_backups_owner_id ON public.user_backups (owner_id);
CREATE INDEX IF NOT EXISTS idx_user_backups_created_at ON public.user_backups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_backups_owner_created ON public.user_backups (owner_id, created_at DESC);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS): public.user_backups
-- ============================================================================

ALTER TABLE public.user_backups ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist to make migration idempotent
DROP POLICY IF EXISTS "Users can view their own backups" ON public.user_backups;
DROP POLICY IF EXISTS "Users can insert their own backups" ON public.user_backups;
DROP POLICY IF EXISTS "Users can update their own backups" ON public.user_backups;
DROP POLICY IF EXISTS "Users can delete their own backups" ON public.user_backups;

-- Policy: SELECT
CREATE POLICY "Users can view their own backups" ON public.user_backups
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- Policy: INSERT
CREATE POLICY "Users can insert their own backups" ON public.user_backups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Policy: UPDATE
CREATE POLICY "Users can update their own backups" ON public.user_backups
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Policy: DELETE
CREATE POLICY "Users can delete their own backups" ON public.user_backups
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ============================================================================
-- 3. STORAGE BUCKET: user-backups
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-backups',
  'user-backups',
  false,
  52428800, -- 50MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/json'];

-- ============================================================================
-- 4. STORAGE RLS SECURITY: storage.objects
-- ============================================================================

-- Path structure requirement: user-backups/<auth_uid>/images/<filename>

-- Drop policies if they exist to make migration idempotent
DROP POLICY IF EXISTS "User backups storage read policy" ON storage.objects;
DROP POLICY IF EXISTS "User backups storage insert policy" ON storage.objects;
DROP POLICY IF EXISTS "User backups storage update policy" ON storage.objects;
DROP POLICY IF EXISTS "User backups storage delete policy" ON storage.objects;

-- Storage Policy: SELECT
CREATE POLICY "User backups storage read policy" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-backups' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage Policy: INSERT
CREATE POLICY "User backups storage insert policy" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-backups' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage Policy: UPDATE
CREATE POLICY "User backups storage update policy" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-backups' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-backups' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage Policy: DELETE
CREATE POLICY "User backups storage delete policy" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-backups' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
