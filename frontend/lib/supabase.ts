import { createClient } from '@supabase/supabase-js';

/** True when the browser has both public Supabase values it needs to sign people in. */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-for-build.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!isSupabaseConfigured) {
  console.warn(
    "⚠️ Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing. " +
    "Using placeholder values to prevent Next.js build-time pre-rendering from crashing. Sign-in will not work until they are set."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
