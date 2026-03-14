import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Single client — used for both auth and data operations.
// Two separate clients caused RLS failures because the data client
// didn't always have the auth JWT from the auth client.
export const supabase = createClient(SUPABASE_URL, ANON_KEY);
export const supabaseAuth = supabase;
