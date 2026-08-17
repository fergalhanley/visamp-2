"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  /** True until the first identity check resolves. */
  loading: boolean;
  /** Signed in but hasn't claimed a username yet (E5.3). */
  needsUsername: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state for the client tree.
 *
 * Deliberately hydrated in the browser rather than from the root layout:
 * reading cookies server-side would make every route dynamic, and the landing
 * and permalink pages are meant to stay prerendered for crawlers (E7.5). The
 * cost is a brief "Log in" flash before the account menu appears, which is
 * invisible in practice because the chrome starts hidden.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [fetched, setFetched] = useState<{
    userId: string;
    row: Profile | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // getUser() validates against the auth server rather than trusting the
    // cookie contents.
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      return data ?? null;
    },
    [supabase],
  );

  useEffect(() => {
    if (!user) return;

    let active = true;
    void loadProfile(user.id).then((row) => {
      if (active) setFetched({ userId: user.id, row });
    });

    return () => {
      active = false;
    };
  }, [user, loadProfile]);

  // Derived, so signing out clears the profile without an extra render pass —
  // and a profile fetched for a previous user can never leak into a new one.
  const profile = user && fetched?.userId === user.id ? fetched.row : null;

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setFetched({ userId: user.id, row: await loadProfile(user.id) });
  }, [user, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      needsUsername: Boolean(user) && profile !== null && !profile.username,
      refreshProfile,
      signOut,
    }),
    [user, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
