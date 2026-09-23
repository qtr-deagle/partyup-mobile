import { useColorScheme } from '@/hooks/use-color-scheme';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocking';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, ShieldOff, UserX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await listBlockedUsers();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setBlocked(result.data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleUnblock(userId: string) {
    setBusyId(userId);
    const { error } = await unblockUser(userId);
    setBusyId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setBlocked((current) => current.filter((user) => user.blocked_id !== userId));
  }

  return (
    <View className={`flex-1 ${background}`}>
      <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
            <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
          </TouchableOpacity>
          <Text className={`ml-3 ${typography.pageTitle} ${titleColor}`}>Blocked Users</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-5">
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator className="mt-8" color="#2A55D4" />
        ) : blocked.length === 0 ? (
          <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
            <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <UserX size={38} color="#2A55D4" />
            </View>
            <Text className={`mt-6 text-headline-20 font-bold text-center ${primary}`}>No blocked users</Text>
            <Text className={`mt-2 text-center text-base leading-6 ${secondary}`}>Travelers you block won&apos;t appear in Discover, nearby search, or the map.</Text>
          </View>
        ) : (
          blocked.map((user) => (
            <View key={user.blocked_id} className={`flex-row items-center gap-3 rounded-2xl border p-4 ${card}`}>
              <View className="h-11 w-11 items-center justify-center rounded-full bg-[#B7C4EC]">
                <Text className="text-base font-bold text-[#24314A]">{user.display_name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text className={`flex-1 text-base font-bold ${primary}`}>{user.display_name}</Text>
              <TouchableOpacity
                onPress={() => void handleUnblock(user.blocked_id)}
                disabled={busyId === user.blocked_id}
                className={`flex-row items-center gap-2 rounded-2xl border px-4 py-2.5 ${border}`}
              >
                {busyId === user.blocked_id ? <ActivityIndicator color="#2A55D4" /> : <ShieldOff size={16} color="#2A55D4" />}
                <Text className="font-bold text-[#2A55D4]">Unblock</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
