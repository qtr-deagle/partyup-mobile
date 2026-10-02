import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

// Profile cosmetics: banners (profile header) and avatar frames. The catalog,
// prices and ownership live in Supabase (202610030001); how each one looks
// lives here in COSMETIC_STYLES, keyed by cosmetics.key -- keep them in sync.

export type CosmeticKind = 'banner' | 'frame';

export type Cosmetic = {
  key: string;
  kind: CosmeticKind;
  name: string;
  description: string | null;
  // Bought with coins when set, otherwise unlocked by unlock_mission.
  cost: number | null;
  unlock_mission: string | null;
  min_rank: string | null;
  sort: number;
};

export type OwnedCosmetic = {
  cosmetic_key: string;
  kind: CosmeticKind;
  equipped: boolean;
};

export type Loadout = { banner: string | null; frame: string | null };

export type BannerPattern = 'orbs' | 'hills' | 'waves' | 'peaks' | 'stars' | 'rays' | 'road' | 'shield' | 'crown';
export type BannerStyle = { colors: [string, string]; pattern: BannerPattern };
export type FrameStyle = { colors: [string, string] };

// No banner equipped = the classic PartyUp blue.
export const DEFAULT_BANNER: BannerStyle = { colors: ['#2747C7', '#2747C7'], pattern: 'orbs' };

export const BANNER_STYLES: Record<string, BannerStyle> = {
  banner_sunset: { colors: ['#F97316', '#DB2777'], pattern: 'hills' },
  banner_bay: { colors: ['#1D4ED8', '#0E7490'], pattern: 'waves' },
  banner_sierra: { colors: ['#166534', '#0F766E'], pattern: 'peaks' },
  banner_night: { colors: ['#1E1B4B', '#6D28D9'], pattern: 'stars' },
  banner_golden: { colors: ['#B45309', '#CA8A04'], pattern: 'rays' },
  banner_open_road: { colors: ['#0F172A', '#B91C1C'], pattern: 'road' },
  banner_pillar: { colors: ['#312E81', '#1D4ED8'], pattern: 'shield' },
  banner_legend: { colors: ['#581C87', '#BE185D'], pattern: 'crown' },
};

export const FRAME_STYLES: Record<string, FrameStyle> = {
  frame_silver: { colors: ['#E2E8F0', '#64748B'] },
  frame_sunset: { colors: ['#F97316', '#DB2777'] },
  frame_emerald: { colors: ['#34D399', '#065F46'] },
  frame_gilded: { colors: ['#FDE68A', '#B45309'] },
  frame_trail: { colors: ['#38BDF8', '#B91C1C'] },
  frame_loyal: { colors: ['#818CF8', '#1D4ED8'] },
  frame_rising: { colors: ['#F0ABFC', '#7C3AED'] },
};

export function bannerStyle(key: string | null | undefined) {
  return (key && BANNER_STYLES[key]) || DEFAULT_BANNER;
}

export function frameStyle(key: string | null | undefined) {
  return (key && FRAME_STYLES[key]) || null;
}

export async function listCosmetics(): Promise<{ data: Cosmetic[]; error: Error | null }> {
  try {
    const { data, error } = await withRequestTimeout(
      supabase.from('cosmetics').select('key, kind, name, description, cost, unlock_mission, min_rank, sort').eq('is_active', true).order('sort'),
      'Loading cosmetics'
    );
    if (error) return { data: [], error: new Error(error.message) };
    return { data: (data ?? []) as Cosmetic[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Loading cosmetics failed.') };
  }
}

export async function listOwnedCosmetics(userId: string): Promise<{ data: OwnedCosmetic[]; error: Error | null }> {
  try {
    const { data, error } = await withRequestTimeout(
      supabase.from('user_cosmetics').select('cosmetic_key, kind, equipped').eq('user_id', userId),
      'Loading cosmetics'
    );
    if (error) return { data: [], error: new Error(error.message) };
    return { data: (data ?? []) as OwnedCosmetic[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Loading cosmetics failed.') };
  }
}

export function loadoutOf(owned: OwnedCosmetic[]): Loadout {
  return {
    banner: owned.find((item) => item.kind === 'banner' && item.equipped)?.cosmetic_key ?? null,
    frame: owned.find((item) => item.kind === 'frame' && item.equipped)?.cosmetic_key ?? null,
  };
}

// What someone is wearing, for their profile header.
export async function getLoadout(userId: string): Promise<Loadout> {
  try {
    const { data } = await withRequestTimeout(
      supabase.from('user_cosmetics').select('cosmetic_key, kind, equipped').eq('user_id', userId).eq('equipped', true),
      'Loading profile style'
    );
    return loadoutOf((data ?? []) as OwnedCosmetic[]);
  } catch {
    return { banner: null, frame: null };
  }
}

// Returns the coins spent.
export async function buyCosmetic(key: string): Promise<{ data: number; error: Error | null }> {
  try {
    const { data, error } = await withRequestTimeout(supabase.rpc('buy_cosmetic', { p_key: key }), 'Buying item');
    if (error) return { data: 0, error: new Error(error.message) };
    return { data: Number(data ?? 0), error: null };
  } catch (error) {
    return { data: 0, error: error instanceof Error ? error : new Error('Buying item failed.') };
  }
}

// key = null takes the current one off.
export async function equipCosmetic(kind: CosmeticKind, key: string | null): Promise<{ error: Error | null }> {
  try {
    const { error } = await withRequestTimeout(supabase.rpc('equip_cosmetic', { p_kind: kind, p_key: key }), 'Saving profile style');
    return { error: error ? new Error(error.message) : null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Saving profile style failed.') };
  }
}
