// ── Supabase client (singleton) ──────────────────────────────────────
// Optional cross-device sync layer. The whole feature is gated on these two
// env vars being present: if either is missing (e.g. a fork without .env.local),
// `supabase` is null and the app stays 100% local-only exactly as before — no
// auth, no network, guest mode forever. Everything downstream (useAuth,
// cloudSync) treats a null client as "sync disabled".
//
// The publishable key is intentionally embedded client-side. It grants nothing
// on its own — RLS on public.kv_store scopes every row to auth.uid() = user_id.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Null when the env vars aren't configured — callers must handle this. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

/** True when cross-device sync is available (env configured). */
export const syncEnabled = supabase !== null;
