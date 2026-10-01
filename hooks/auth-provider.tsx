import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

export type ProfileRole = 'traveler' | 'guild_leader' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type UserProfile = {
  id: string;
  display_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  name_suffix: string | null;
  avatar_url: string | null;
  bio: string | null;
  date_of_birth: string | null;
  interests: string[];
  phone: string | null;
  city: string | null;
  country: string | null;
  gcash_handle: string | null;
  paymaya_handle: string | null;
  role: ProfileRole;
  verification_status: VerificationStatus;
  is_active: boolean;
  warning_alerts_enabled: boolean;
  emergency_sos_enabled: boolean;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  // True once the signed-in user's profile fetch has finished (successfully
  // or not), so gates can tell "no profile yet" from "still loading".
  profileReady: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null);

  const refreshProfile = useMemo(
    () => async () => {
      if (!session?.user.id) {
        setProfile(null);
        return;
      }

      const userId = session.user.id;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

      setProfile(error || !data ? null : (data as UserProfile));
      setProfileLoadedFor(userId);
    },
    [session]
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) => {
            setTimeout(() => resolve({ data: { session: null } }), 2000);
          }),
        ]);

        if (!isMounted) {
          return;
        }

        setSession(sessionResult.data.session);
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  // Staff can change role/verification/suspension from the website; pick that
  // up whenever the app comes back to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshProfile();
      }
    });
    return () => subscription.remove();
  }, [refreshProfile]);

  const signOut = useMemo(
    () => async () => {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    },
    []
  );

  const profileReady = !session || profileLoadedFor === session.user.id;

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      profileReady,
      refreshProfile,
      signOut,
    }),
    [loading, profile, profileReady, refreshProfile, session, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}