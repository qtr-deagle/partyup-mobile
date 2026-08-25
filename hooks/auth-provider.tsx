import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ProfileRole = 'traveler' | 'staff' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type UserProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  date_of_birth: string | null;
  interests: string[];
  phone: string | null;
  city: string | null;
  country: string | null;
  role: ProfileRole;
  verification_status: VerificationStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useMemo(
    () => async () => {
      if (!session?.user.id) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();

      if (error || !data) {
        setProfile(null);
        return;
      }

      setProfile(data as UserProfile);
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

  const signOut = useMemo(
    () => async () => {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    },
    []
  );

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      refreshProfile,
      signOut,
    }),
    [loading, profile, refreshProfile, session, signOut]
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