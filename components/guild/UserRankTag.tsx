import { RankMedal } from '@/components/guild/RankMedal';
import { useRankInfo } from '@/hooks/use-rank-info';
import { rankFor, rankLabel, titleFor } from '@/lib/guilds';
import { Text, View } from 'react-native';

type Props = {
  userId: string | null | undefined;
  isDark: boolean;
  // 'inline': medal + "Gold II" in a row (under a name).
  // 'overlay': just the medal, pinned to the corner of an avatar; put it
  //   inside the avatar's wrapper.
  // 'title': medal + "Gold II Traveler" chip, for profile headers.
  variant?: 'inline' | 'overlay' | 'title';
  size?: number;
  // Skip the lookup when the caller already knows the points.
  points?: number;
  role?: string | null;
};

// Someone's rank medal, looked up (batched + cached) by user id. Renders
// nothing until loaded, or for people with no points yet.
export function UserRankTag({ userId, isDark, variant = 'inline', size, points, role }: Props) {
  const info = useRankInfo(points === undefined ? userId : null);
  const lifetime = points ?? info?.lifetime_points;
  if (lifetime === undefined || lifetime <= 0) return null;

  const { rank, tier } = rankFor(lifetime);

  if (variant === 'overlay') {
    const medalSize = size ?? 22;
    return (
      <View pointerEvents="none" style={{ position: 'absolute', right: -medalSize * 0.2, bottom: -medalSize * 0.25 }}>
        <RankMedal rank={rank.name} size={medalSize} />
      </View>
    );
  }

  if (variant === 'title') {
    return (
      <View
        className={`flex-row items-center gap-1.5 self-center rounded-full py-1 pl-1.5 pr-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}
        style={{ borderWidth: 1, borderColor: `${rank.color}55` }}>
        <RankMedal rank={rank.name} tier={tier} size={size ?? 22} />
        <Text className="text-sm font-black" style={{ color: isDark ? '#FFFFFF' : rank.color }}>
          {titleFor(lifetime, role ?? info?.role)}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1">
      <RankMedal rank={rank.name} size={size ?? 16} />
      <Text className="text-xs font-bold" style={{ color: isDark ? '#CBD5E1' : rank.color }}>
        {rankLabel(lifetime)}
      </Text>
    </View>
  );
}
