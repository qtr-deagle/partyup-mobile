import { LeaderboardPanel, Segmented } from '@/components/guild/LeaderboardPanel';
import { MissionsPanel } from '@/components/guild/MissionsPanel';
import { MyGuildPanel } from '@/components/guild/MyGuildPanel';
import { RewardsPanel } from '@/components/guild/RewardsPanel';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPointsSummary } from '@/lib/guilds';
import { claimableCount, getMyMissions } from '@/lib/missions';
import { getTheme } from '@/lib/theme';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type Tab = 'mine' | 'missions' | 'leaderboard' | 'rewards';
const TAB_IDS: Tab[] = ['mine', 'missions', 'leaderboard', 'rewards'];

// Guild hub with four tabs. Opens on Leaderboard for a traveler who has no
// guild yet (that's where Join is), otherwise on My Guild. `?tab=` overrides.
export default function GuildScreen() {
  const isDark = useColorScheme() === 'dark';
  const { profile } = useAuth();
  const { primaryColor, screenBackground } = getTheme(isDark);
  const params = useLocalSearchParams<{ tab?: string }>();
  const requestedTab = TAB_IDS.includes(params.tab as Tab) ? (params.tab as Tab) : null;

  const [tab, setTab] = useState<Tab | null>(requestedTab);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [readyMissions, setReadyMissions] = useState(0);

  const isLeader = profile?.role === 'guild_leader';
  const isTraveler = profile?.role === 'traveler';

  const loadMissionCount = useCallback(async () => {
    const { data } = await getMyMissions();
    setReadyMissions(claimableCount(data));
  }, []);

  const loadMembership = useCallback(async () => {
    const [{ data }] = await Promise.all([getPointsSummary(), loadMissionCount()]);
    const nextGuildId = data?.guild_id ?? null;
    setGuildId(nextGuildId);
    setTab((current) => current ?? (isTraveler && !nextGuildId ? 'leaderboard' : 'mine'));
    setReady(true);
  }, [isTraveler, loadMissionCount]);

  useFocusEffect(
    useCallback(() => {
      void loadMembership();
    }, [loadMembership])
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'Guild' },
    { id: 'missions', label: readyMissions > 0 ? `Missions • ${readyMissions}` : 'Missions' },
    { id: 'leaderboard', label: 'Board' },
    { id: 'rewards', label: 'Rewards' },
  ];

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader title={isLeader ? 'Guild Leader Hub' : 'Guilds'} subtitle="Missions, rankings and rewards">
        <View className="mt-4">
          <Segmented isDark={isDark} options={tabs} value={tab ?? 'mine'} onChange={(value) => setTab(value as Tab)} />
        </View>
      </ScreenHeader>

      {!ready || !tab ? (
        <View key="loading" className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : tab === 'mine' ? (
        <MyGuildPanel key="mine" isDark={isDark} onFindGuild={() => setTab('leaderboard')} onGuildChanged={() => void loadMembership()} />
      ) : tab === 'missions' ? (
        <MissionsPanel key="missions" isDark={isDark} onFindGuild={() => setTab('leaderboard')} onChanged={() => void loadMissionCount()} />
      ) : tab === 'leaderboard' ? (
        <LeaderboardPanel
          key="leaderboard"
          isDark={isDark}
          myUserId={profile?.id}
          myGuildId={guildId}
          canJoin={isTraveler && !guildId}
          onJoined={() => {
            void loadMembership();
            setTab('mine');
          }}
        />
      ) : (
        <RewardsPanel key="rewards" />
      )}
    </View>
  );
}
