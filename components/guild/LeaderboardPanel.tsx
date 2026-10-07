import { GuildEmblem } from '@/components/GuildEmblem';
import { RankMedal } from '@/components/guild/RankMedal';
import { UserRankTag } from '@/components/guild/UserRankTag';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { useGuildJoin } from '@/hooks/use-guild-join';
import {
  getGuildLeaderboard,
  getMyJoinRequest,
  getPlayerLeaderboard,
  guildLevel,
  titleFor,
  type GuildStanding,
  type LeaderboardPeriod,
  type PlayerStanding,
} from '@/lib/guilds';
import { getTheme } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Clock, Crown, Lock, Shield, Trophy, Users } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

// Gold, silver, bronze.
export const MEDALS = ['#CA8A04', '#94A3B8', '#B45309'];

type Board = 'guilds' | 'players';

type Props = {
  isDark: boolean;
  myUserId: string | undefined;
  myGuildId: string | null;
  // Travelers without a guild get Join buttons on guild rows.
  canJoin: boolean;
  onJoined: () => void;
};

export function LeaderboardPanel({ isDark, myUserId, myGuildId, canJoin, onJoined }: Props) {
  const insets = useSafeAreaInsets();
  const { primaryColor, primaryText, mutedText, mutedPanel } = getTheme(isDark);

  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [board, setBoard] = useState<Board>('guilds');
  const [guilds, setGuilds] = useState<GuildStanding[]>([]);
  const [players, setPlayers] = useState<PlayerStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const { myRequest, setMyRequest, joiningId, requestJoin, cancelRequest, overlay } = useGuildJoin({
    onJoined,
    onRequested: () => void load(period),
  });

  const load = useCallback(
    async (nextPeriod: LeaderboardPeriod) => {
      const [guildResult, playerResult, requestResult] = await Promise.all([
        getGuildLeaderboard(nextPeriod),
        getPlayerLeaderboard(nextPeriod),
        canJoin ? getMyJoinRequest() : Promise.resolve({ data: null, error: null }),
      ]);
      setErrorMessage(guildResult.error?.message ?? playerResult.error?.message ?? null);
      setGuilds(guildResult.data);
      setPlayers(playerResult.data);
      setMyRequest(requestResult.data);
      setLoading(false);
    },
    [canJoin, setMyRequest]
  );

  useFocusEffect(
    useCallback(() => {
      void load(period);
    }, [load, period])
  );

  async function refresh() {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  }

  function openGuild(guildId: string) {
    router.push({ pathname: '/guild/[id]', params: { id: guildId } });
  }

  function openPlayer(row: PlayerStanding, index: number) {
    router.push({ pathname: '/profile/[id]', params: { id: row.user_id, displayName: row.display_name, place: String(index + 1), period } });
  }

  const periodLabel = PERIODS.find((option) => option.id === period)?.label.toLowerCase() ?? '';
  const myPlayerIndex = players.findIndex((row) => row.user_id === myUserId);

  const podium: PodiumEntry[] =
    board === 'guilds'
      ? guilds.slice(0, 3).map((row) => ({
          key: row.guild_id,
          name: row.name,
          sub: `${row.member_count} members`,
          points: row.points,
          visual: <GuildEmblem emblem={row.emblem} color={row.color} size={44} />,
          mine: row.guild_id === myGuildId,
          onPress: () => openGuild(row.guild_id),
        }))
      : players.slice(0, 3).map((row, index) => ({
          key: row.user_id,
          name: row.display_name,
          sub: row.guild_name ?? 'No guild',
          points: row.points,
          visual: <Initial name={row.display_name} size={44} medal={<UserRankTag userId={row.user_id} isDark={isDark} variant="overlay" points={row.lifetime_points} size={22} />} />,
          mine: row.user_id === myUserId,
          onPress: () => openPlayer(row, index),
        }));

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
      {errorMessage ? (
        <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
          <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
        </View>
      ) : null}

      {canJoin ? (
        <View className={`flex-row items-center gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
          {myRequest ? <Clock size={20} color={primaryColor} /> : <Shield size={20} color={primaryColor} />}
          <Text className={`flex-1 text-sm ${primaryText}`}>
            {myRequest
              ? `Your request to ${myRequest.guild_name} is waiting for the leader. Open guilds can still be joined instantly.`
              : 'Pick a guild below. Open guilds let you Join right away; others need a Request the leader approves.'}
          </Text>
        </View>
      ) : null}

      <Segmented
        isDark={isDark}
        options={[
          { id: 'guilds', label: 'Guilds', icon: <Shield size={15} color={board === 'guilds' ? primaryColor : isDark ? '#94A3B8' : '#64748B'} /> },
          { id: 'players', label: 'Players', icon: <Users size={15} color={board === 'players' ? primaryColor : isDark ? '#94A3B8' : '#64748B'} /> },
        ]}
        value={board}
        onChange={(value) => setBoard(value as Board)}
      />
      <Segmented isDark={isDark} options={PERIODS} value={period} onChange={(value) => setPeriod(value as LeaderboardPeriod)} small />

      {loading ? (
        <Card key="loading">
          {[0, 1, 2].map((index) => (
            <SkeletonRow key={index} />
          ))}
        </Card>
      ) : (board === 'guilds' ? guilds.length : players.length) === 0 ? (
        <EmptyState
          key={`empty-${board}`}
          icon={<Trophy size={34} color="#2A55D4" />}
          title={board === 'guilds' ? 'No guilds yet' : `No points ${periodLabel} yet`}
          message={board === 'guilds' ? 'Guild Leaders found guilds in the app. Check back soon.' : 'Complete trips and reviews to get on the board.'}
        />
      ) : (
        <View key={`board-${board}`} className="gap-4">
          <Podium isDark={isDark} entries={podium} />

          <Card>
            <View className="gap-2">
              {board === 'guilds'
                ? guilds.map((row, index) => (
                    <AnimatedPressable
                      key={row.guild_id}
                      onPress={() => openGuild(row.guild_id)}
                      scaleTo={0.98}
                      accessibilityLabel={`Open ${row.name}`}
                      className={`flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}
                      style={row.guild_id === myGuildId ? { borderWidth: 2, borderColor: row.color } : undefined}>
                      <RankNumber index={index} mutedText={mutedText} />
                      <GuildEmblem emblem={row.emblem} color={row.color} size={38} />
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          {row.join_policy === 'approval' ? <Lock size={11} color={isDark ? '#94A3B8' : '#64748B'} /> : null}
                          {row.min_rank ? <RankMedal rank={row.min_rank} size={13} /> : null}
                          <Text className={`flex-1 text-xs ${mutedText}`} numberOfLines={1}>
                            Lv {guildLevel(row.lifetime_points)} · {row.member_count}
                            /{row.member_cap} members{row.min_rank ? ` · ${row.min_rank}+` : ''} · {row.leader_name}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className={`text-base font-black ${primaryText}`}>{row.points}</Text>
                        {canJoin && myRequest?.guild_id === row.guild_id ? (
                          <AnimatedPressable
                            key="requested"
                            onPress={cancelRequest}
                            disabled={joiningId === 'cancel'}
                            className={`mt-1 flex-row items-center gap-1 rounded-full border px-2.5 py-1 ${isDark ? 'border-[#334155]' : 'border-[#CBD5E1]'}`}
                            accessibilityLabel={`Cancel request to ${row.name}`}>
                            {joiningId === 'cancel' ? <ActivityIndicator color={primaryColor} size="small" /> : <Clock size={11} color={primaryColor} />}
                            <Text className="text-xs font-bold" style={{ color: primaryColor }}>
                              Requested
                            </Text>
                          </AnimatedPressable>
                        ) : canJoin && row.member_count >= row.member_cap ? (
                          <View key="full" className={`mt-1 rounded-full px-3 py-1 ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]'}`}>
                            <Text className={`text-xs font-bold ${mutedText}`}>Full</Text>
                          </View>
                        ) : canJoin ? (
                          <AnimatedPressable key="join" onPress={() => requestJoin(row)} disabled={joiningId === row.guild_id} className="mt-1 rounded-full bg-[#284BD6] px-3 py-1">
                            {joiningId === row.guild_id ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text className="text-xs font-bold text-white">{row.join_policy === 'approval' ? 'Request' : 'Join'}</Text>
                            )}
                          </AnimatedPressable>
                        ) : (
                          <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                        )}
                      </View>
                    </AnimatedPressable>
                  ))
                : players.map((row, index) => (
                    <AnimatedPressable
                      key={row.user_id}
                      onPress={() => openPlayer(row, index)}
                      scaleTo={0.98}
                      accessibilityLabel={`Open ${row.display_name}'s player card`}
                      className={`flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}
                      style={row.user_id === myUserId ? { borderWidth: 2, borderColor: primaryColor } : undefined}>
                      <RankNumber index={index} mutedText={mutedText} />
                      <Initial name={row.display_name} size={38} medal={<UserRankTag userId={row.user_id} isDark={isDark} variant="overlay" points={row.lifetime_points} size={19} />} />
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
                          {row.display_name}
                          {row.user_id === myUserId ? ' (you)' : ''}
                        </Text>
                        <View className="flex-row items-center gap-1.5">
                          {row.guild_emblem && row.guild_color ? <GuildEmblem emblem={row.guild_emblem} color={row.guild_color} size={14} /> : null}
                          <Text className={`flex-1 text-xs ${mutedText}`} numberOfLines={1}>
                            {titleFor(row.lifetime_points, row.role)}
                            {row.guild_name ? ` · ${row.guild_name}` : ''}
                          </Text>
                        </View>
                      </View>
                      <Text className={`text-base font-black ${primaryText}`}>{row.points}</Text>
                      <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                    </AnimatedPressable>
                  ))}
            </View>
          </Card>

          {board === 'players' && myPlayerIndex < 0 ? (
            <Text className={`text-center text-xs ${mutedText}`}>You're not on the board {periodLabel} yet. Finish a trip or a review to climb in.</Text>
          ) : null}
        </View>
      )}

      {overlay}
    </ScrollView>
  );
}

type PodiumEntry = { key: string; name: string; sub: string; points: number; visual: ReactNode; mine: boolean; onPress: () => void };

// Top 3 as 2nd | 1st | 3rd, with the winner's card raised.
function Podium({ isDark, entries }: { isDark: boolean; entries: PodiumEntry[] }) {
  const { primaryText, mutedText } = getTheme(isDark);
  const order = [1, 0, 2].filter((place) => entries[place]);
  return (
    <View className="flex-row items-end justify-center gap-2.5">
      {order.map((place) => {
        const entry = entries[place];
        const medal = MEDALS[place];
        return (
          <AnimatedPressable
            key={entry.key}
            onPress={entry.onPress}
            scaleTo={0.96}
            accessibilityLabel={`Open ${entry.name}`}
            className={`flex-1 items-center rounded-[22px] border-2 px-2 pb-3 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}
            style={{ borderColor: entry.mine ? '#284BD6' : medal, paddingTop: place === 0 ? 22 : 14, minHeight: place === 0 ? 178 : 152 }}>
            {place === 0 ? <Crown size={20} color={medal} /> : null}
            <View className="mt-1">{entry.visual}</View>
            <View className="mt-2 rounded-full px-2.5 py-0.5" style={{ backgroundColor: medal }}>
              <Text className="text-xs font-black text-white">#{place + 1}</Text>
            </View>
            <Text className={`mt-1.5 text-center text-sm font-bold ${primaryText}`} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text className={`text-center text-[11px] ${mutedText}`} numberOfLines={1}>
              {entry.sub}
            </Text>
            <Text className="mt-1 text-base font-black" style={{ color: medal }}>
              {entry.points} pts
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function RankNumber({ index, mutedText }: { index: number; mutedText: string }) {
  return (
    <Text className={`w-6 text-center text-sm font-black ${index < 3 ? '' : mutedText}`} style={index < 3 ? { color: MEDALS[index] } : undefined}>
      {index + 1}
    </Text>
  );
}

function Initial({ name, size, medal }: { name: string; size: number; medal?: ReactNode }) {
  return (
    <View className="items-center justify-center rounded-full bg-[#B7C4EC]" style={{ width: size, height: size }}>
      <Text className="font-bold text-[#24314A]" style={{ fontSize: size * 0.4 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
      {medal}
    </View>
  );
}

export function Segmented({
  isDark,
  options,
  value,
  onChange,
  small = false,
}: {
  isDark: boolean;
  options: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  small?: boolean;
}) {
  const { primaryText, mutedText } = getTheme(isDark);
  return (
    <View className={`flex-row rounded-2xl p-1 ${isDark ? 'bg-[#111B2E]' : 'bg-[#E9EEF7]'}`}>
      {options.map((option) => (
        <AnimatedPressable
          key={option.id}
          onPress={() => onChange(option.id)}
          className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl ${small ? 'py-1.5' : 'py-2'} ${value === option.id ? (isDark ? 'bg-[#22324B]' : 'bg-white') : ''}`}>
          {option.icon}
          {/* Bold via fontFamily only, not `font-bold`: on Android fontWeight on
              a custom font measures narrower than it draws, so "This week"
              wrapped and its second line was clipped, leaving just "This". */}
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'Inter_700Bold', fontWeight: 'normal' }}
            className={`text-center ${small ? 'text-xs' : 'text-sm'} ${value === option.id ? primaryText : mutedText}`}>
            {option.label}
          </Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}
