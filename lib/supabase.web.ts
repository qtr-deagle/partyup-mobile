import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.');
}

// Browsers already have a real localStorage; the expo-sqlite polyfill (needed on native, which has
// no built-in localStorage) fails to bundle for web, so this platform file skips it entirely.
// expo-router's SSR step still evaluates this module in Node, where `localStorage` doesn't exist,
// so fall back to a no-op store there — SSR only needs an initial render, not a persisted session.
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : noopStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Create a user profile in the public.profiles table after auth signup.
 * Calls a secure SQL function that bypasses RLS restrictions.
 *
 * @param displayName - The display name from signup form
 * @returns true if profile was created, false if it failed
 */
export async function createUserProfile(displayName: string) {
  try {
    const { data, error } = await supabase.rpc('create_user_profile', {
      p_display_name: displayName,
    });

    if (error) {
      console.error('Error creating user profile:', error);
      return false;
    }

    if (data?.error) {
      console.error('Profile creation error:', data.error);
      return false;
    }

    console.log('Profile created successfully:', data);
    return true;
  } catch (err) {
    console.error('Unexpected error creating user profile:', err);
    return false;
  }
}
