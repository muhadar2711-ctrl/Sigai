import { createClient } from '@supabase/supabase-js';
import { addSystemError } from './engine.js';

let supabaseClient: any = null;

export function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn("SUPABASE_URL or SUPABASE_KEY not set. Supabase will not be initialized.");
    return;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase Client Initialized");
  } catch (err: any) {
    console.error("Supabase Init Error:", err);
    addSystemError(`Supabase Init Error: ${err.message}`);
  }
}

export function getSupabase() {
  return supabaseClient;
}
