-- ============================================================
-- BV Vent – Storage policies for "vent-photos" bucket
--
-- Run this AFTER you have created the bucket manually:
--   Supabase Dashboard → Storage → New bucket
--   Name: vent-photos   Public: OFF   File size limit: 10 MB
--
-- Then run this script in SQL Editor.
-- ============================================================

-- Allow the anon key to upload photos to the vent-photos bucket
CREATE POLICY "vent_photos_anon_insert"
  ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'vent-photos');

-- Allow the anon key to read photos from the vent-photos bucket
CREATE POLICY "vent_photos_anon_select"
  ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'vent-photos');

-- Allow the anon key to update (re-upload / upsert) photos
CREATE POLICY "vent_photos_anon_update"
  ON storage.objects
  FOR UPDATE TO anon
  USING (bucket_id = 'vent-photos');
