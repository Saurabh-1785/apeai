/**
 * ApeAI — Supabase Client
 *
 * Creates a singleton Supabase client for database operations.
 * Fails gracefully with a clear error if credentials are missing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import settings from '../config';

let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;

  if (!settings.supabaseConfigured) {
    throw new RuntimeError(
      'Supabase is not configured. Please set SUPABASE_URL and SUPABASE_KEY in your .env file.',
    );
  }

  try {
    _supabaseClient = createClient(settings.supabaseUrl, settings.supabaseKey);
    console.info('✅ Supabase client initialized successfully');
    return _supabaseClient;
  } catch (err) {
    throw new RuntimeError(`Failed to connect to Supabase: ${err}`);
  }
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    await client.from('feedback').select('id').limit(1);
    return true;
  } catch {
    return false;
  }
}

/** Typed runtime error to distinguish from DB errors */
export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

// ─── Query Helpers ────────────────────────────────────────────

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Fetches every row of a query by paging through it.
 * PostgREST caps responses at 1000 rows by default, so any "select all"
 * must page or it silently truncates.
 *
 * @param buildPage - builds the query for rows [from, to] (inclusive)
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PageResult<T>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(`Query failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/** Splits an array into chunks (keeps `.in()` filters under URL length limits). */
export function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
