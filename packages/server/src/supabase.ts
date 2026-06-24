
import { createClient } from '@supabase/supabase-js';
import { addSystemError } from './state/state_manager.js';

let supabase: any;

export function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[SUPABASE] Supabase client initialized.');
  } else {
    console.warn('[SUPABASE] Supabase URL or Key not found, skipping initialization.');
  }
}

export function getSupabase() {
  return supabase;
}
