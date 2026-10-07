import { UserRankTag } from '@/components/guild/UserRankTag';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatTimeAgo } from '@/lib/datetime';
import { getJoinRequests, getPointsSummary, respondJoinRequest, type GuildJoinRequest } from '@/lib/guilds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme } from '@/lib/theme';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The Guild Leader's join-request queue, opened from the leader dashboard.
// `?guildId=` skips the lookup; without it, the leader's own guild is used.
export default function GuildRequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId?: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { primaryColor, primaryText, mutedText, mutedPanel, softBorder, screenBackground } = getTheme(isDark);

  const [guildId, setGuildId] = useState<string | null>(params.guildId ?? null);
  const [requests, setRequests] = useState<GuildJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    let id = guildId;
    if (!id) {
      const { data, error } = await getPointsSummary();
      if (error) setErrorMessage(error.message);
      id = data?.guild_id ?? null;
      setGuildId(id);
    }
    if (id) {
      const { data, error } = await getJoinRequests(id);
      if (error) setErrorMessage(error.message);
      else setRequests(data);
    }
    setLoading(false);
  }, [guildId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // New requests (and ones cancelled by the traveler) show up live.
  useEffect(() => {
    if (!guildId) return;
    const channel = supabase
      .channel(uniqueChannelName(`guild-requests-screen:${guildId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_join_requests', filter: `guild_id=eq.${guildId}` }, () => {
        void getJoinRequests(guildId).then(({ data }) => setRequests(data));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [guildId]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function answerRequest(request: GuildJoinRequest, accept: boolean) {
    setBusyId(request.id);
    const { error } = await respondJoinRequest(request.id, accept);
    setBusyId(null);
    if (error) {
      Alert.alert(accept ? 'Could not accept' : 'Could not decline', error.message);
      await load();
      return;
    }
    setRequests((current) => current.filter((row) => row.id !== request.id));
  }

  function confirmDecline(request: GuildJoinRequest) {
    Alert.alert(`Decline ${request.display_name}?`, "They'll be told this time didn't work out and can ask another guild.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void answerRequest(request, false) },
    ]);
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader title="Join Requests" subtitle={!loading ? `${requests.length} waiting` : undefined} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <Card key="loading">
            {[0, 1, 2].map((index) => <SkeletonRow key={index} />)}
          </Card>
        ) : !guildId ? (
          <EmptyState key="no-guild" icon={<UserPlus size={34} color={primaryColor} />} title="No guild yet" message="Join requests appear here once you lead a guild." />
        ) : requests.length === 0 ? (
          <EmptyState key="empty" icon={<UserPlus size={34} color={primaryColor} />} title="No pending requests" message="When travelers ask to join your guild, they'll show up here." />
        ) : (
          requests.map((request, index) => (
            <Card key={request.id} index={index}>
              <AnimatedPressable
                onPress={() => router.push({ pathname: '/profile/[id]', params: { id: request.user_id, displayName: request.display_name } })}
                scaleTo={0.98}
                accessibilityLabel={`View ${request.display_name}'s player card`}
                className="flex-row items-center gap-3">
                {request.avatar_url ? (
                  <Image source={{ uri: request.avatar_url }} className="h-12 w-12 rounded-full" />
                ) : (
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-[#B7C4EC]">
                    <Text className="text-lg font-bold text-[#24314A]">{request.display_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
                    {request.display_name}
                  </Text>
                  {request.lifetime_points > 0 ? (
                    <UserRankTag userId={request.user_id} isDark={isDark} points={request.lifetime_points} />
                  ) : (
                    <Text className={`text-xs ${mutedText}`}>New traveler</Text>
                  )}
                  <Text className={`mt-0.5 text-xs ${mutedText}`}>Asked {formatTimeAgo(request.created_at)}</Text>
                </View>
              </AnimatedPressable>

              {busyId === request.id ? (
                <View className="mt-3 items-center py-2.5">
                  <ActivityIndicator color={primaryColor} />
                </View>
              ) : (
                <View className="mt-3 flex-row gap-2">
                  <AnimatedPressable
                    onPress={() => confirmDecline(request)}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border py-2.5 ${softBorder}`}
                    accessibilityLabel={`Decline ${request.display_name}`}>
                    <X size={16} color="#B91C1C" />
                    <Text className="text-sm font-bold text-[#B91C1C]">Decline</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => void answerRequest(request, true)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-[#284BD6] py-2.5"
                    accessibilityLabel={`Accept ${request.display_name}`}>
                    <Check size={16} color="#FFFFFF" />
                    <Text className="text-sm font-bold text-white">Accept</Text>
                  </AnimatedPressable>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
