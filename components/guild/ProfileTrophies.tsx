import { BadgeMedal, SeasonMedal } from '@/components/guild/TrophyMedals';
import { Card } from '@/components/ui/screen-header';
import { useRankInfo } from '@/hooks/use-rank-info';
import { badgesFor, getPointsSummary, getSeasonAwards, seasonLabel, type PointsSummary, type SeasonAward } from '@/lib/guilds';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

// Trophy shelf for a public profile: season medals first, then earned
// badges. Hidden entirely for someone who hasn't won anything yet.
export function ProfileTrophies({ userId, isDark, index = 0 }: { userId: string; isDark: boolean; index?: number }) {
  const info = useRankInfo(userId);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [seasons, setSeasons] = useState<SeasonAward[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getPointsSummary(userId), getSeasonAwards(userId)]).then(([summaryResult, seasonResult]) => {
      if (cancelled) return;
      setSummary(summaryResult.data);
      setSeasons(seasonResult.data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Earned first, then locked ones dimmed so visitors see what's left to win.
  const badges = badgesFor(summary, info?.role).sort((a, b) => Number(b.earned) - Number(a.earned));
  const earnedCount = badges.filter((badge) => badge.earned).length;

  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  return (
    <Card index={index}>
      <View className="flex-row items-center justify-between">
        <Text className={`text-[16px] font-bold ${primary}`}>Trophy room</Text>
        <Text className={`text-xs font-bold ${secondary}`}>
          {earnedCount}/{badges.length} badges{seasons.length ? ` · ${seasons.length} season ${seasons.length === 1 ? 'medal' : 'medals'}` : ''}
        </Text>
      </View>

      {seasons.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="items-start gap-4">
          {seasons.map((award) => (
            <View key={award.id} className="w-16 items-center">
              <SeasonMedal place={award.place} board={award.board} size={44} />
              <Text className={`mt-1 text-center text-[10px] font-bold ${secondary}`}>{seasonLabel(award.season)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View className="mt-3 flex-row flex-wrap gap-y-3">
        {badges.map((badge) => (
          <View key={badge.id} className="w-1/4 items-center px-1" style={{ opacity: badge.earned ? 1 : 0.45 }}>
            <BadgeMedal icon={badge.icon} tier={badge.tier} maxTier={badge.thresholds.length} size={42} />
            <Text className={`mt-1 text-center text-[10px] font-bold ${badge.earned ? primary : secondary}`} numberOfLines={2}>
              {badge.name}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
