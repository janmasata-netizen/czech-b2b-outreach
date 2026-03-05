import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Auth client (anon key) — used for signIn / signOut / getUser
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY);

// Data client (service_role) — bypasses RLS for management UI
//
// SECURITY NOTE (accepted risk): The service_role key is bundled in the frontend.
// This is an internal management tool accessible only on a private VPS IP.
// If the UI is ever exposed to the internet, migrate to RLS policies with the anon key only.
export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
