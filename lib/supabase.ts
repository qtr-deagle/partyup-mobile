import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import 'expo-sqlite/localStorage/install';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Channel name for a postgres_changes-only subscription, unique per call.
 *
 * supabase.channel(name) hands back the existing channel when one with that
 * name is still open, and removeChannel() in an effect cleanup is async. So if
 * a screen remounts before the old channel is gone, `.on()` lands on an
 * already-subscribed channel and throws "cannot add postgres_changes callbacks
 * after subscribe()". The name of a postgres_changes channel is local only, so
 * a random suffix is safe. Don't use this for broadcast/presence channels:
 * those need the same name on every device.
 */
export function uniqueChannelName(base: string) {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}

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