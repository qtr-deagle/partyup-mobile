import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Returns true once, the first time this phone sees the user at a 100 trust
// score. Unlike useRankUp it also fires for users already at 100, since they
// have never been shown the award.
export function useTrustAward(userId: string | null | undefined, trustScore: number | null) {
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!userId || trustScore === null || trustScore < 100) return;
    const key = `partyup.trust-award-seen.${userId}`;
    let cancelled = false;

    void (async () => {
      try {
        if ((await AsyncStorage.getItem(key)) !== null || cancelled) return;
        await AsyncStorage.setItem(key, '1');
      } catch {
        return;
      }
      if (!cancelled) setCelebrating(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, trustScore]);

  const dismiss = useCallback(() => setCelebrating(false), []);
  return { celebrating, dismiss };
}
