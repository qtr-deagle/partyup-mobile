import { getRankInfo, type RankInfo } from '@/lib/guilds';
import { useEffect, useState } from 'react';

// Rank lookups for other users, batched and cached so a list of 30 friends
// costs one request instead of 30. Every useRankInfo() call made in the same
// tick joins one get_rank_info RPC.

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { info: RankInfo | null; at: number }>();
const waiting = new Map<string, ((info: RankInfo | null) => void)[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const ids = [...batch.keys()];
  // get_rank_info caps a call at 200 ids.
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await getRankInfo(chunk);
    const byId = new Map(data.map((row) => [row.user_id, row]));
    for (const id of chunk) {
      const info = byId.get(id) ?? null;
      // Don't cache failures, so the next screen retries.
      if (!error) cache.set(id, { info, at: Date.now() });
      batch.get(id)?.forEach((resolve) => resolve(info));
    }
  }
}

export function loadRankInfo(userId: string): Promise<RankInfo | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.info);
  return new Promise((resolve) => {
    waiting.set(userId, [...(waiting.get(userId) ?? []), resolve]);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), 0);
  });
}

// Forget cached ranks (e.g. after the user's own points change).
export function invalidateRankInfo(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export function useRankInfo(userId: string | null | undefined) {
  const [info, setInfo] = useState<RankInfo | null>(() => {
    const hit = userId ? cache.get(userId) : undefined;
    return hit?.info ?? null;
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadRankInfo(userId).then((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return info;
}
