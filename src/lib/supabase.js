import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('[BV Vent] Missing Supabase env vars. Check .env.local or GitHub secrets.');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },  // No auth for this tool; use RLS anon policies
});
