import { GuildEmblem } from '@/components/GuildEmblem';
import { medalColors, RankMedal } from '@/components/guild/RankMedal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn, Skeleton } from '@/components/ui/motion';
import { useRankInfo } from '@/hooks/use-rank-info';
import { badgesFor, getGuild, getPointsSummary, rankFor, tierStarts, type Guild, type PointsSummary } from '@/lib/guilds';
import { useRouter } from 'expo-router';
import { ChevronRight, Shield, Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

const PERIOD_LABELS: Record<string, string> = { week: 'this week', month: 'this month', all: 'all time' };

type Props = {
  userId: string;
  isDark: boolean;
  // Leaderboard position, when opened from the Players board.
  place?: number | null;
  period?: string | null;
};

// Game-style "player card" for a profile: a rank hero panel in the rank's
// colors with the animated medal and XP bars, then stats and guild.
export function PlayerRankCard({ userId, isDark, place, period }: Props) {
  const router = useRouter();
  const info = useRankInfo(userId);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await getPointsSummary(userId);
      if (cancelled) return;
      setSummary(data);
      if (data?.guild_id) {
        const guildResult = await getGuild(data.guild_id);
        if (!cancelled) setGuild(guildResult.data);
      } else {
        setGuild(null);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!loaded) {
    return <Skeleton key="player-card-loading" className="h-[300px] w-full rounded-[24px]" />;
  }

  const lifetime = summary?.lifetime_points ?? 0;
  const { rank, index, next, progress, tier, tierLabel, nextTierAt } = rankFor(lifetime);
  const [light, , dark] = medalColors(rank.name);
  const role = info?.role ?? null;
  const roleName = role === 'guild_leader' ? 'Guild Leader' : role === 'admin' ? 'Admin' : 'Traveler';
  const badges = badgesFor(summary, role);
  const earnedBadges = badges.filter((badge) => badge.earned).length;
  const isLeader = guild?.leader_id === userId;

  // XP bar: progress from where this tier began to where the next one starts.
  const tierFloor = tierStarts(index)[tier - 1];
  const xpDone = nextTierAt === null ? 1 : Math.min(1, (lifetime - tierFloor) / Math.max(1, nextTierAt - tierFloor));
  const nextTierName = tier < 3 ? `${rank.name} ${['I', 'II', 'III'][tier]}` : next ? `${next.name} I` : null;

  return (
    <Animated.View key="player-card" entering={riseIn(0, 450)} className="overflow-hidden rounded-[24px]" style={{ backgroundColor: dark }}>
      {/* Hero */}
      <View className="items-center px-5 pb-5 pt-6">
        <View className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/10" />
        <View className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-black/15" />

        <RankMedal rank={rank.name} tier={tier} size={112} animated />
        <Text className="mt-2 text-[30px] font-black uppercase tracking-[3px] text-white">
          {rank.name} {tierLabel}
        </Text>
        <Text className="text-sm font-bold uppercase tracking-[2px] text-white/70">{roleName}</Text>

        {place ? (
          <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1">
            <Trophy size={13} color={dark} />
            <Text className="text-xs font-black" style={{ color: dark }}>
              #{place} on the board {PERIOD_LABELS[period ?? 'week'] ?? ''}
            </Text>
          </View>
        ) : null}

        {/* XP to next tier */}
        <View className="mt-4 w-full">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-white/80">{nextTierName ? `Next: ${nextTierName}` : 'Max tier reached'}</Text>
            <Text className="text-xs font-black text-white">{nextTierAt === null ? `${lifetime} pts` : `${lifetime} / ${nextTierAt} pts`}</Text>
          </View>
          <View className="mt-1.5 h-3.5 overflow-hidden rounded-full bg-white/20">
            <View className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round(xpDone * 100))}%`, backgroundColor: light }} />
          </View>
          {next ? (
            <Text className="mt-1.5 text-[11px] text-white/70">
              {Math.round(progress * 100)}% of the way to {next.name} · {next.min - lifetime} pts to go
            </Text>
          ) : (
            <Text className="mt-1.5 text-[11px] text-white/70">Top rank. Legendary.</Text>
          )}
        </View>
      </View>

      {/* Stats */}
      <View className={`gap-3 p-4 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
        <View className="flex-row gap-2">
          <Stat label="Lifetime" value={lifetime} isDark={isDark} accent={rank.color} />
          <Stat label="This month" value={summary?.month_points ?? 0} isDark={isDark} />
          <Stat label="This week" value={summary?.week_points ?? 0} isDark={isDark} />
          <Stat label="Badges" value={`${earnedBadges}/${badges.length}`} isDark={isDark} />
        </View>

        {guild ? (
          <AnimatedPressable
            key="guild"
            onPress={() => router.push({ pathname: '/guild/[id]', params: { id: guild.id } })}
            scaleTo={0.98}
            className={`flex-row items-center gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F6FB]'}`}
            accessibilityLabel={`Open ${guild.name}`}>
            <GuildEmblem emblem={guild.emblem} color={guild.color} size={40} />
            <View className="flex-1">
              <Text className={`text-xs font-bold uppercase tracking-wide ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>
                {isLeader ? 'Leads' : 'Member of'}
              </Text>
              <Text className={`text-base font-black ${isDark ? 'text-white' : 'text-[#182847]'}`} numberOfLines={1}>
                {guild.name}
              </Text>
            </View>
            <ChevronRight size={18} color={isDark ? '#64748B' : '#94A3B8'} />
          </AnimatedPressable>
        ) : (
          <View key="free-agent" className={`flex-row items-center gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F6FB]'}`}>
            <View className={`h-10 w-10 items-center justify-center rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]'}`}>
              <Shield size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </View>
            <Text className={`text-sm font-bold ${isDark ? 'text-[#CBD5E1]' : 'text-[#475569]'}`}>Free agent · not in a guild</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function Stat({ label, value, isDark, accent }: { label: string; value: number | string; isDark: boolean; accent?: string }) {
  return (
    <View className={`flex-1 items-center rounded-2xl py-2.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F6FB]'}`}>
      <Text className="text-lg font-black" style={{ color: accent ?? (isDark ? '#FFFFFF' : '#182847') }} numberOfLines={1}>
        {value}
      </Text>
      <Text className={`text-[10px] font-semibold ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>{label}</Text>
    </View>
  );
}
