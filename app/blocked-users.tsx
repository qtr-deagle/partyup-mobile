import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocking';
import { useFocusEffect } from 'expo-router';
import { ShieldOff, UserX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BlockedUsersScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';

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
      <ScreenHeader title="Blocked Users" subtitle={!loading && blocked.length ? `${blocked.length} blocked` : undefined} />

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <Card key="loading">
            {[0, 1, 2].map((index) => <SkeletonRow key={index} />)}
          </Card>
        ) : blocked.length === 0 ? (
          <EmptyState
            key="empty"
            icon={<UserX size={34} color="#2A55D4" />}
            title="No blocked users"
            message="Travelers you block won't appear in Discover, nearby search, or the map."
          />
        ) : (
          blocked.map((user, index) => (
            <Card key={user.blocked_id} index={index} className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-[#B7C4EC]">
                <Text className="text-base font-bold text-[#24314A]">{user.display_name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text className={`flex-1 text-base font-bold ${primary}`}>{user.display_name}</Text>
              <AnimatedPressable
                onPress={() => void handleUnblock(user.blocked_id)}
                disabled={busyId === user.blocked_id}
                className={`flex-row items-center gap-2 rounded-2xl border px-4 py-2.5 ${border}`}
              >
                {busyId === user.blocked_id ? <ActivityIndicator color="#2A55D4" /> : <ShieldOff size={16} color="#2A55D4" />}
                <Text className="font-bold text-[#2A55D4]">Unblock</Text>
              </AnimatedPressable>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
