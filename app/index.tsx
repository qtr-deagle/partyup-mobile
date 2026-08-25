import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/auth-provider';

export default function IndexScreen() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}