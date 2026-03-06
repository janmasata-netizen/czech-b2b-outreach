import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Auth client — used for signIn / signOut / getUser
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY);

// Data client — same anon key, relies on RLS policies for access control
export const supabase = createClient(SUPABASE_URL, ANON_KEY);
