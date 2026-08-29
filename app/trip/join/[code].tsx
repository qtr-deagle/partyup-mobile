import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { joinTripViaInvite } from '@/lib/carpool';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export default function JoinTripScreen() {
  const router = useRouter();
  const { code, ref } = useLocalSearchParams<{ code: string; ref?: string }>();
  const { session, loading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (loading || !code) {
      return;
    }

    if (!session) {
      const redirectPath = `/trip/join/${code}${ref ? `?ref=${ref}` : ''}`;
      router.replace({ pathname: '/(auth)/sign-in', params: { redirect: redirectPath } });
      return;
    }

    if (attempted.current) {
      return;
    }
    attempted.current = true;

    void (async () => {
      const { data, error } = await joinTripViaInvite(code, ref);
      if (error || !data) {
        setErrorMessage(error?.message ?? 'Unable to join this trip.');
        return;
      }
      router.replace(`/trip/${data.trip_id}`);
    })();
  }, [code, loading, ref, router, session]);

  if (errorMessage) {
    return (
      <View className={`flex-1 items-center justify-center gap-4 px-8 ${background}`}>
        <AlertTriangle size={40} color="#E32727" />
        <Text className={`text-center text-lg font-bold ${primary}`}>{errorMessage}</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/carpooling')} className="mt-2 rounded-2xl bg-[#2A55D4] px-5 py-3">
          <Text className="font-bold text-white">Back to My Trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className={`flex-1 items-center justify-center gap-4 ${background}`}>
      <ActivityIndicator size="large" color="#2A55D4" />
      <Text className={`text-base ${secondary}`}>Joining trip…</Text>
    </View>
  );
}
