import type { Celebration } from '@/components/guild/RankUpCelebration';
import { invalidateRankInfo } from '@/hooks/use-rank-info';
import { rankFor } from '@/lib/guilds';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Rank + tier as one comparable number: Gold II = 32.
function rankStep(points: number) {
  const { index, tier } = rankFor(points);
  return index * 10 + tier;
}

// Watches the user's lifetime points and returns a celebration when they've
// climbed past the last rank/tier this phone has seen. The first time it runs
// it just records the current rank, so existing users aren't greeted with a
// celebration for a rank they already had.
export function useRankUp(userId: string | null | undefined, lifetimePoints: number | null) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    if (!userId || lifetimePoints === null) return;
    const key = `partyup.rank-seen.${userId}`;
    const step = rankStep(lifetimePoints);
    let cancelled = false;

    void (async () => {
      let seen: number | null = null;
      try {
        const raw = await AsyncStorage.getItem(key);
        seen = raw === null ? null : Number(raw);
      } catch {
        return;
      }
      if (cancelled) return;
      if (seen !== null && Number.isFinite(seen) && step > seen) {
        invalidateRankInfo(userId);
        setCelebration({ points: lifetimePoints, major: Math.floor(step / 10) > Math.floor(seen / 10) });
      }
      if (seen === null || step > seen) {
        try {
          await AsyncStorage.setItem(key, String(step));
        } catch {
          // Worst case the celebration shows again next time.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, lifetimePoints]);

  const dismiss = useCallback(() => setCelebration(null), []);
  return { celebration, dismiss };
}
