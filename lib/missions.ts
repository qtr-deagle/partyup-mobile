import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

export type MissionCategory = 'weekly' | 'monthly' | 'milestone' | 'guild';

export type Mission = {
  key: string;
  category: MissionCategory;
  title: string;
  description: string;
  icon: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  // Needs a guild the user isn't in yet.
  locked: boolean;
  // Milestone chains (Explorer I → IV) share a chain id.
  chain: string | null;
  step: number;
  resets_at: string | null;
};

export type MissionState = 'claimable' | 'active' | 'claimed' | 'locked';

export function missionState(mission: Mission): MissionState {
  if (mission.locked) return 'locked';
  if (mission.claimed) return 'claimed';
  if (mission.progress >= mission.target) return 'claimable';
  return 'active';
}

export async function getMyMissions(): Promise<{ data: Mission[]; error: Error | null }> {
  try {
    const { data, error } = await withRequestTimeout(supabase.rpc('get_my_missions'), 'Loading missions');
    if (error) return { data: [], error: new Error(error.message) };
    return { data: (data ?? []) as Mission[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Loading missions failed.') };
  }
}

// Returns the points awarded.
export async function claimMission(key: string): Promise<{ data: number; error: Error | null }> {
  try {
    const { data, error } = await withRequestTimeout(supabase.rpc('claim_mission', { p_key: key }), 'Claiming mission');
    if (error) return { data: 0, error: new Error(error.message) };
    return { data: Number(data ?? 0), error: null };
  } catch (error) {
    return { data: 0, error: error instanceof Error ? error : new Error('Claiming mission failed.') };
  }
}

// For milestone chains, show one card per chain: the first step not yet
// claimed (or the last step once the whole chain is done). Other missions
// pass through unchanged.
export function collapseChains(missions: Mission[]) {
  const byChain = new Map<string, Mission[]>();
  const result: { mission: Mission; steps: Mission[] }[] = [];
  for (const mission of missions) {
    if (!mission.chain) {
      result.push({ mission, steps: [mission] });
      continue;
    }
    const steps = byChain.get(mission.chain);
    if (steps) steps.push(mission);
    else {
      const list = [mission];
      byChain.set(mission.chain, list);
      result.push({ mission, steps: list });
    }
  }
  return result.map(({ mission, steps }) => {
    if (!mission.chain) return { mission, steps };
    const sorted = [...steps].sort((a, b) => a.step - b.step);
    const current = sorted.find((step) => !step.claimed) ?? sorted[sorted.length - 1];
    return { mission: current, steps: sorted };
  });
}

// Missions waiting to be claimed (for badges on the home card and tab).
export function claimableCount(missions: Mission[]) {
  return missions.filter((mission) => missionState(mission) === 'claimable').length;
}

// "3d 4h", "5h 12m", "12m"
export function timeLeft(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'now';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
