// ── useAuth — thin React wrapper over Supabase auth ──────────────────
// Exposes the current user + sign-in/out methods to the UI. When signed out
// (the default, "guest mode"), `user` is null and the app works exactly as
// today. Signing in wires cloudSync on; signing out wires it off.
//
// cloudSync is told about the user here (setSyncUser) rather than in the panel,
// so sync state always tracks the true auth state regardless of which UI path
// triggered the change (fresh sign-in, session restore, sign-out, token
// refresh).

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { setSyncUser } from './cloudSync';

export interface AuthApi {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
}

// True once cloudSync has already pulled at boot for an existing session (see
// main.tsx). Prevents onAuthStateChange's initial event from pulling a second
// time. Module-scoped: set by main.tsx before React mounts.
let bootPullDone = false;
export function markBootPullDone(): void {
  bootPullDone = true;
}

export function useAuth(): AuthApi {
  const [user, setUser] = useState<User | null>(null);
  // If sync isn't configured at all, there's nothing to load — start ready.
  const [loading, setLoading] = useState<boolean>(supabase !== null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    // Seed from the current session (boot already pulled for it, so don't pull
    // again here — pass pullOnSignIn:false).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const u = data.session?.user ?? null;
      setUser(u);
      setSyncUser(u, /* pullOnSignIn */ false);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      // Pull immediately on a fresh sign-in, but NOT for the very first event
      // that just replays the already-pulled boot session.
      const shouldPull = u !== null && bootPullDone === false;
      setSyncUser(u, shouldPull);
      // After the first auth event, the boot session (if any) is accounted for;
      // subsequent sign-ins should pull.
      bootPullDone = false;
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    if (!supabase) return { error: 'sync-unavailable' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: 'sync-unavailable' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: 'sync-unavailable' };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (!supabase) return { error: 'sync-unavailable' };
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  };

  return {
    user,
    loading,
    signInWithMagicLink,
    signInWithPassword,
    signUpWithPassword,
    signOut,
  };
}
