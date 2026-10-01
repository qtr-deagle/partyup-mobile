import { GuildEmblem } from '@/components/GuildEmblem';
import { riseIn } from '@/components/ui/motion';
import { RankMedal } from '@/components/guild/RankMedal';
import { RankUpCelebration } from '@/components/guild/RankUpCelebration';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useAuth } from '@/hooks/auth-provider';
import { useRankUp } from '@/hooks/use-rank-up';
import { getGuild, getPointsSummary, rankFor, titleFor, type Guild, type PointsSummary } from '@/lib/guilds';
import { claimableCount, getMyMissions } from '@/lib/missions';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Coins, Shield, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

// Home-screen teaser for the guild system: rank, coins and the user's guild,
// tapping through to the full Guild screen.
export function GuildSummaryCard({ isDark, delay = 110 }: { isDark: boolean; delay?: number }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { primaryColor, warningColor, panelBackground, panelBorder, mutedPanel, mutedText, primaryText } = getTheme(isDark);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [readyMissions, setReadyMissions] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [{ data }, missionsResult] = await Promise.all([getPointsSummary(), getMyMissions()]);
        if (cancelled) return;
        setSummary(data);
        setReadyMissions(claimableCount(missionsResult.data));
        if (data?.guild_id) {
          const guildResult = await getGuild(data.guild_id);
          if (!cancelled) setGuild(guildResult.data);
        } else {
          setGuild(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const lifetime = summary?.lifetime_points ?? 0;
  const { rank, next, progress, tier } = rankFor(lifetime);
  const { celebration, dismiss } = useRankUp(profile?.id, summary ? lifetime : null);
  const isLeader = profile?.role === 'guild_leader';
  const guildLine = guild
    ? guild.name
    : isLeader
      ? 'Found your guild to start recruiting'
      : 'Join a guild and earn together';

  return (
    <Animated.View entering={riseIn(delay)}>
      <AnimatedPressable onPress={() => router.push('/guild')} className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.sectionTitle} ${primaryText}`}>{isLeader ? 'My Guild' : 'Guild'}</Text>
          <View className="flex-row items-center gap-2">
            {readyMissions > 0 ? (
              <AnimatedPressable
                onPress={() => router.push({ pathname: '/guild', params: { tab: 'missions' } })}
                className="flex-row items-center gap-1 rounded-full bg-[#FBBF24] px-2.5 py-1"
                accessibilityLabel={`${readyMissions} missions ready to claim`}>
                <Target size={13} color="#422006" />
                <Text className="text-xs font-black text-[#422006]">
                  {readyMissions} {readyMissions === 1 ? 'mission' : 'missions'} ready
                </Text>
              </AnimatedPressable>
            ) : null}
            <ChevronRight size={18} color={isDark ? '#94A3B8' : '#64748B'} />
          </View>
        </View>

        <View className={`mt-3 flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}>
          {guild ? (
            <GuildEmblem emblem={guild.emblem} color={guild.color} size={42} />
          ) : (
            <View className={`h-[42px] w-[42px] items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <Shield size={20} color={primaryColor} />
            </View>
          )}
          <View className="flex-1">
            <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
              {guildLine}
            </Text>
            <Text className={`text-xs ${mutedText}`}>{summary ? titleFor(lifetime, profile?.role) : '…'}</Text>
          </View>
          {summary ? <RankMedal key="medal" rank={rank.name} tier={tier} size={34} /> : null}
          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <Coins size={14} color={warningColor} />
              <Text className={`text-base font-black ${primaryText}`}>{summary?.coins ?? '—'}</Text>
            </View>
            <Text className={`text-[11px] ${mutedText}`}>coins</Text>
          </View>
        </View>

        <View className="mt-3 h-2 overflow-hidden rounded-full bg-[#D9E4DE]">
          <View className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: rank.color }} />
        </View>
        <Text className={`mt-1.5 text-xs ${mutedText}`}>
          {next ? `${next.min - lifetime} pts to ${next.name}` : 'Top rank reached'} · {summary?.week_points ?? 0} pts this week
        </Text>
      </AnimatedPressable>

      <RankUpCelebration celebration={celebration} role={profile?.role} displayName={profile?.display_name ?? ''} guildName={guild?.name} onClose={dismiss} />
    </Animated.View>
  );
}
