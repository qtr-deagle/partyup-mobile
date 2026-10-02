import type { BulacanMunicipality } from '@/lib/bulacan';
import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

export type GuildEmblem =
  | 'shield' | 'flame' | 'mountain' | 'compass' | 'star' | 'wave' | 'leaf' | 'crown'
  | 'car' | 'bike' | 'tent' | 'trees' | 'sun' | 'palm' | 'anchor' | 'plane' | 'camera' | 'utensils' | 'heart' | 'bolt';
export type LeaderboardPeriod = 'week' | 'month' | 'all';
// 'open': anyone verified joins instantly. 'approval': the leader accepts requests.
export type JoinPolicy = 'open' | 'approval';
// Lowest rank a traveler needs to join; null = anyone.
export type MinRank = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Legend';
export type GuildFocus = 'carpool' | 'tours' | 'mountains' | 'beaches' | 'food' | 'roadtrips' | 'city' | 'camping';

// Mirrors the guilds.focus check in migration 202610010013.
export const GUILD_FOCUS_OPTIONS: { id: GuildFocus; label: string }[] = [
  { id: 'carpool', label: 'Carpools' },
  { id: 'tours', label: 'Tours' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'food', label: 'Food trips' },
  { id: 'roadtrips', label: 'Road trips' },
  { id: 'city', label: 'City' },
  { id: 'camping', label: 'Camping' },
];
export const GUILD_FOCUS_MAX = 4;
export const GUILD_MIN_RANKS: MinRank[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'];

export type Guild = {
  id: string;
  name: string;
  tagline: string | null;
  emblem: GuildEmblem;
  color: string;
  leader_id: string;
  join_policy: JoinPolicy;
  min_rank: MinRank | null;
  description: string | null;
  // Municipalities members must live in (profiles.city); empty = all of Bulacan.
  areas: BulacanMunicipality[];
  focus: GuildFocus[];
  // Pinned message from the leader.
  announcement: string | null;
  announcement_at: string | null;
  created_at: string;
};

export type GuildStanding = {
  guild_id: string;
  name: string;
  tagline: string | null;
  emblem: GuildEmblem;
  color: string;
  leader_id: string;
  leader_name: string;
  member_count: number;
  points: number;
  lifetime_points: number;
  join_policy: JoinPolicy;
  min_rank: MinRank | null;
  // From guild_member_cap(): grows with guild level.
  member_cap: number;
  areas: BulacanMunicipality[];
};

export type GuildMemberStanding = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_leader: boolean;
  joined_at: string;
  points: number;
  lifetime_points: number;
};

export type PointsSummary = {
  user_id: string;
  lifetime_points: number;
  coins: number;
  week_points: number;
  month_points: number;
  reason_counts: Record<string, number>;
  guild_id: string | null;
};

export type PointEvent = {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  created_at: string;
};

export type GuildReward = {
  id: string;
  title: string;
  description: string | null;
  cost: number;
  audience: 'everyone' | 'guild_leader' | 'traveler';
  stock: number | null;
  // Lowest rank that can redeem it (null = anyone).
  min_rank: string | null;
};

export type RewardRedemption = {
  id: string;
  reward_id: string;
  cost: number;
  status: 'pending' | 'fulfilled' | 'rejected';
  admin_notes: string | null;
  created_at: string;
  handled_at: string | null;
  reward: { title: string } | null;
};

type Result<T> = { data: T; error: Error | null };

async function run<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string, fallback: T): Promise<Result<T>> {
  try {
    const { data, error } = await withRequestTimeout(request, label);
    if (error) return { data: fallback, error: new Error(error.message) };
    return { data: (data ?? fallback) as T, error: null };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error : new Error(`${label} failed.`) };
  }
}

// Bigint columns can arrive as strings; normalize every numeric field we show.
const num = (value: unknown) => Number(value ?? 0);

export async function getPointsSummary(userId?: string) {
  const result = await run<PointsSummary[]>(
    supabase.rpc('get_points_summary', userId ? { p_user_id: userId } : {}),
    'Loading points',
    []
  );
  const row = result.data[0];
  return {
    data: row
      ? {
          ...row,
          lifetime_points: num(row.lifetime_points),
          coins: num(row.coins),
          week_points: num(row.week_points),
          month_points: num(row.month_points),
          reason_counts: row.reason_counts ?? {},
        }
      : null,
    error: result.error,
  };
}

// Readable guild columns (the table's column grant, migration 202610010016).
// The announcement is members-only, so it comes from its own RPC and is null
// for everyone else.
const GUILD_COLUMNS = 'id, name, tagline, emblem, color, leader_id, join_policy, min_rank, description, areas, focus, created_at';

export async function getGuild(guildId: string) {
  const [guild, announcement] = await Promise.all([
    run<Omit<Guild, 'announcement' | 'announcement_at'> | null>(
      supabase.from('guilds').select(GUILD_COLUMNS).eq('id', guildId).maybeSingle(),
      'Loading guild',
      null
    ),
    run<{ announcement: string | null; announcement_at: string | null }[]>(
      supabase.rpc('get_guild_announcement', { p_guild_id: guildId }),
      'Loading announcement',
      []
    ),
  ]);
  if (!guild.data) return { data: null, error: guild.error };
  const pinned = announcement.data[0];
  return {
    data: { ...guild.data, announcement: pinned?.announcement ?? null, announcement_at: pinned?.announcement_at ?? null } as Guild,
    error: null,
  };
}

export async function getGuildLeaderboard(period: LeaderboardPeriod) {
  const result = await run<GuildStanding[]>(supabase.rpc('get_guild_leaderboard', { p_period: period }), 'Loading leaderboard', []);
  return {
    ...result,
    data: result.data.map((row) => ({
      ...row,
      member_count: num(row.member_count),
      points: num(row.points),
      lifetime_points: num(row.lifetime_points),
    })),
  };
}

export type PlayerStanding = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  guild_id: string | null;
  guild_name: string | null;
  guild_emblem: GuildEmblem | null;
  guild_color: string | null;
  points: number;
  lifetime_points: number;
};

export async function getPlayerLeaderboard(period: LeaderboardPeriod, limit = 50) {
  const result = await run<PlayerStanding[]>(
    supabase.rpc('get_player_leaderboard', { p_period: period, p_limit: limit }),
    'Loading top players',
    []
  );
  return {
    ...result,
    data: result.data.map((row) => ({ ...row, points: num(row.points), lifetime_points: num(row.lifetime_points) })),
  };
}

export async function getGuildMemberBoard(guildId: string, period: LeaderboardPeriod) {
  const result = await run<GuildMemberStanding[]>(
    supabase.rpc('get_guild_member_board', { p_guild_id: guildId, p_period: period }),
    'Loading guild members',
    []
  );
  return {
    ...result,
    data: result.data.map((row) => ({ ...row, points: num(row.points), lifetime_points: num(row.lifetime_points) })),
  };
}

export async function getRecentPointEvents(limit = 20) {
  return run<PointEvent[]>(
    supabase.from('guild_point_events').select('id, amount, reason, note, created_at').order('created_at', { ascending: false }).limit(limit),
    'Loading points history',
    []
  );
}

type GuildInput = {
  name: string;
  tagline: string;
  emblem: GuildEmblem;
  color: string;
  joinPolicy: JoinPolicy;
  minRank: MinRank | null;
  description: string;
  areas: BulacanMunicipality[];
  focus: GuildFocus[];
};

function guildSettingsParams(input: GuildInput) {
  return {
    p_name: input.name,
    p_tagline: input.tagline,
    p_emblem: input.emblem,
    p_color: input.color,
    p_join_policy: input.joinPolicy,
    p_min_rank: input.minRank,
    p_description: input.description,
    p_areas: input.areas,
    p_focus: input.focus,
  };
}

export async function createGuild(input: GuildInput) {
  return run<Guild | null>(
    supabase.rpc('create_guild', guildSettingsParams(input)),
    'Founding guild',
    null
  );
}

export async function updateGuild(guildId: string, input: GuildInput) {
  return run<Guild | null>(
    supabase.rpc('update_guild', { p_guild_id: guildId, ...guildSettingsParams(input) }),
    'Saving guild',
    null
  );
}

// 'joined' for open guilds; 'requested' when the leader has to approve.
export async function joinGuild(guildId: string) {
  return run<'joined' | 'requested' | null>(supabase.rpc('join_guild', { p_guild_id: guildId }), 'Joining guild', null);
}

export type GuildJoinRequest = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  lifetime_points: number;
  created_at: string;
};

export type MyJoinRequest = {
  id: string;
  guild_id: string;
  guild_name: string;
  guild_emblem: GuildEmblem;
  guild_color: string;
  created_at: string;
};

// Pending requests for a guild (its leader or an admin only).
export async function getJoinRequests(guildId: string) {
  const result = await run<GuildJoinRequest[]>(supabase.rpc('get_guild_join_requests', { p_guild_id: guildId }), 'Loading join requests', []);
  return { ...result, data: result.data.map((row) => ({ ...row, lifetime_points: num(row.lifetime_points) })) };
}

export async function getMyJoinRequest() {
  const result = await run<MyJoinRequest[]>(supabase.rpc('get_my_guild_join_request'), 'Loading your join request', []);
  return { data: result.data[0] ?? null, error: result.error };
}

export async function respondJoinRequest(requestId: string, accept: boolean) {
  return run<null>(supabase.rpc('respond_guild_join_request', { p_request_id: requestId, p_accept: accept }), 'Answering join request', null);
}

export async function cancelJoinRequest() {
  return run<null>(supabase.rpc('cancel_guild_join_request'), 'Cancelling join request', null);
}

// ---------------------------------------------------------------------------
// Guild invites: leaders invite from a profile; the server only
// allows it when the traveler meets the guild's rank, area and cap rules.
// ---------------------------------------------------------------------------

export type GuildInviteStatus = {
  guild_id: string;
  guild_name: string;
  invite_id: string | null;
  can_invite: boolean;
  reason: string | null;
};

export type MyGuildInvite = {
  id: string;
  guild_id: string;
  guild_name: string;
  guild_emblem: GuildEmblem;
  guild_color: string;
  invited_by_name: string | null;
  created_at: string;
};

// Null when the caller doesn't lead a guild.
export async function getGuildInviteStatus(userId: string) {
  const result = await run<GuildInviteStatus[]>(supabase.rpc('get_guild_invite_status', { p_user_id: userId }), 'Checking guild invite', []);
  return { data: result.data[0] ?? null, error: result.error };
}

export async function inviteToGuild(userId: string) {
  return run<string | null>(supabase.rpc('invite_to_guild', { p_user_id: userId }), 'Sending guild invite', null);
}

export async function cancelGuildInvite(inviteId: string) {
  return run<null>(supabase.rpc('cancel_guild_invite', { p_invite_id: inviteId }), 'Cancelling guild invite', null);
}

export async function getMyGuildInvites() {
  return run<MyGuildInvite[]>(supabase.rpc('get_my_guild_invites'), 'Loading guild invites', []);
}

export async function respondGuildInvite(inviteId: string, accept: boolean) {
  return run<null>(supabase.rpc('respond_guild_invite', { p_invite_id: inviteId, p_accept: accept }), 'Answering guild invite', null);
}

// ---------------------------------------------------------------------------
// Guild leadership: announcement, handover, chat.
// ---------------------------------------------------------------------------

// Empty text clears the announcement.
export async function setGuildAnnouncement(guildId: string, text: string) {
  return run<null>(supabase.rpc('set_guild_announcement', { p_guild_id: guildId, p_text: text }), 'Posting announcement', null);
}

// Hand the guild to a member; the caller stays on as a traveler.
export async function transferGuildLeadership(successorId: string) {
  return run<null>(supabase.rpc('transfer_guild_leadership', { p_successor_id: successorId }), 'Handing over the guild', null);
}

// The eligible member with the most points takes over. Returns their name.
export async function stepDownAsLeader() {
  return run<string | null>(supabase.rpc('step_down_as_leader'), 'Stepping down', null);
}

// Sender or leader. Soft delete: members see "Message removed".
export async function deleteGuildChatMessage(messageId: string) {
  return run<null>(supabase.rpc('delete_guild_chat_message', { p_message_id: messageId }), 'Deleting message', null);
}

// The caller's guild chat thread id (null when not in a guild).
export async function getGuildChatThread() {
  return run<string | null>(supabase.rpc('get_guild_chat_thread'), 'Opening guild chat', null);
}

export type GuildChatPreview = {
  thread_id: string;
  guild: Guild;
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
};

// Everything the Messages list needs to show the guild chat as a row.
// Null when the caller isn't in a guild.
export async function getGuildChatPreview(myUserId: string): Promise<Result<GuildChatPreview | null>> {
  const [{ data: summary }, thread] = await Promise.all([getPointsSummary(), getGuildChatThread()]);
  if (thread.error) return { data: null, error: thread.error };
  const guildId = summary?.guild_id;
  const threadId = thread.data;
  if (!guildId || !threadId) return { data: null, error: null };

  const [guild, last, me] = await Promise.all([
    getGuild(guildId),
    run<{ body: string; created_at: string; sender_id: string; message_type: string }[]>(
      supabase
        .from('chat_messages')
        .select('body, created_at, sender_id, message_type')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1),
      'Loading guild chat',
      []
    ),
    run<{ last_read_at: string | null } | null>(
      supabase.from('chat_participants').select('last_read_at').eq('thread_id', threadId).eq('user_id', myUserId).maybeSingle(),
      'Loading guild chat',
      null
    ),
  ]);
  if (!guild.data) return { data: null, error: guild.error };

  let unread = supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId).neq('sender_id', myUserId);
  if (me.data?.last_read_at) unread = unread.gt('created_at', me.data.last_read_at);
  const { count } = await unread;

  const latest = last.data[0];
  return {
    data: {
      thread_id: threadId,
      guild: guild.data,
      last_message: latest ? (latest.message_type === 'image' ? '📷 Photo' : latest.body) : null,
      last_message_at: latest?.created_at ?? null,
      last_message_sender_id: latest?.sender_id ?? null,
      unread_count: count ?? 0,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Becoming a Guild Leader.
// ---------------------------------------------------------------------------

// Keep in sync with get_leader_eligibility() (migration 202610010011).
export const LEADER_REQUIREMENTS = { trips: 10, hosted: 2, rating: 4, ratingCount: 3 };

export type LeaderEligibility = {
  trips_completed: number;
  trips_hosted: number;
  verified: boolean;
  avg_rating: number | null;
  rating_count: number;
  trips_ok: boolean;
  hosted_ok: boolean;
  rating_ok: boolean;
  eligible: boolean;
  pending_application: boolean;
};

export type LeaderApplication = {
  id: string;
  guild_name: string;
  pitch: string;
  status: 'pending' | 'approved' | 'declined';
  admin_notes: string | null;
  created_at: string;
  handled_at: string | null;
};

export async function getLeaderEligibility() {
  const result = await run<LeaderEligibility[]>(supabase.rpc('get_leader_eligibility'), 'Checking eligibility', []);
  const row = result.data[0];
  return {
    data: row
      ? { ...row, trips_completed: num(row.trips_completed), trips_hosted: num(row.trips_hosted), rating_count: num(row.rating_count), avg_rating: row.avg_rating === null ? null : Number(row.avg_rating) }
      : null,
    error: result.error,
  };
}

export async function getMyLeaderApplication() {
  const result = await run<LeaderApplication[]>(supabase.rpc('get_my_leader_application'), 'Loading your application', []);
  return { data: result.data[0] ?? null, error: result.error };
}

export async function applyForGuildLeader(guildName: string, pitch: string) {
  return run<LeaderApplication | null>(
    supabase.rpc('apply_for_guild_leader', { p_guild_name: guildName, p_pitch: pitch }),
    'Sending application',
    null
  );
}

export async function leaveGuild() {
  return run<null>(supabase.rpc('leave_guild'), 'Leaving guild', null);
}

export async function removeGuildMember(userId: string) {
  return run<null>(supabase.rpc('remove_guild_member', { p_user_id: userId }), 'Removing member', null);
}

export async function listRewards() {
  return run<GuildReward[]>(
    supabase.from('guild_rewards').select('id, title, description, cost, audience, stock, min_rank').eq('is_active', true).order('cost'),
    'Loading rewards',
    []
  );
}

export async function listMyRedemptions() {
  return run<RewardRedemption[]>(
    supabase
      .from('guild_reward_redemptions')
      .select('id, reward_id, cost, status, admin_notes, created_at, handled_at, reward:guild_rewards(title)')
      .order('created_at', { ascending: false })
      .limit(30),
    'Loading your rewards',
    []
  );
}

export async function redeemReward(rewardId: string) {
  return run<RewardRedemption | null>(supabase.rpc('redeem_guild_reward', { p_reward_id: rewardId }), 'Redeeming reward', null);
}

// ---------------------------------------------------------------------------
// Ranks, badges and labels. Kept in sync with the website's lib/guilds.ts.
// ---------------------------------------------------------------------------

export type Rank = { name: string; min: number; color: string };

// Thresholds are mirrored server-side in guild_rank_index() (migration
// 202610010003), which enforces rank perks. Keep both in sync.
export const RANKS: Rank[] = [
  { name: 'Rookie', min: 0, color: '#64748B' },
  { name: 'Bronze', min: 100, color: '#B45309' },
  { name: 'Silver', min: 300, color: '#64748B' },
  { name: 'Gold', min: 750, color: '#CA8A04' },
  { name: 'Platinum', min: 1500, color: '#0891B2' },
  { name: 'Legend', min: 3000, color: '#7C3AED' },
];

// Legend has no next rank, so its tiers are spaced by this many points.
const LEGEND_TIER_STEP = 1500;
const TIER_NUMERALS = ['I', 'II', 'III'];

// Each rank splits into tiers I / II / III so there's a win between the long
// rank gaps. Returns the point where each tier starts.
export function tierStarts(rankIndex: number) {
  const rank = RANKS[rankIndex];
  const next = RANKS[rankIndex + 1];
  if (!next) return [rank.min, rank.min + LEGEND_TIER_STEP, rank.min + LEGEND_TIER_STEP * 2];
  const span = next.min - rank.min;
  // Rounded to 5s so targets read nicely ("35 pts", not "33 pts").
  return [0, 1, 2].map((k) => rank.min + Math.round((span * k) / 3 / 5) * 5);
}

// "San Jose del Monte & Santa Maria", "Malolos, Bulacan +2", or all of Bulacan.
export function formatGuildAreas(areas: readonly string[]) {
  if (areas.length === 0) return 'All of Bulacan';
  if (areas.length <= 2) return areas.join(' & ');
  return `${areas.slice(0, 2).join(', ')} +${areas.length - 2}`;
}

// True when a member living in `city` fits the guild's areas (or it has none).
export function inGuildAreas(city: string | null | undefined, areas: readonly string[]) {
  return areas.length === 0 || (!!city && areas.includes(city));
}

// True when `points` reaches the guild's minimum rank (or it has none).
export function meetsMinRank(points: number, minRank: MinRank | null) {
  if (!minRank) return true;
  return points >= (RANKS.find((rank) => rank.name === minRank)?.min ?? 0);
}

export function rankFor(points: number) {
  let index = 0;
  RANKS.forEach((rank, i) => {
    if (points >= rank.min) index = i;
  });
  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (points - rank.min) / (next.min - rank.min) : 1;

  const starts = tierStarts(index);
  let tier = 1;
  starts.forEach((start, i) => {
    if (points >= start) tier = i + 1;
  });
  // Points where the next tier (or next rank) begins; null at Legend III.
  const nextTierAt = tier < 3 ? starts[tier] : (next?.min ?? null);

  return {
    rank,
    index,
    next,
    progress: Math.max(0, Math.min(1, progress)),
    tier,
    tierLabel: TIER_NUMERALS[tier - 1],
    nextTierAt,
  };
}

// "Gold II" -- rank plus tier.
export function rankLabel(points: number) {
  const { rank, tierLabel } = rankFor(points);
  return `${rank.name} ${tierLabel}`;
}

// "Gold II Guild Leader", "Silver I Traveler" -- shown on profiles and boards.
export function titleFor(points: number, role: string | null | undefined) {
  const roleName = role === 'guild_leader' ? 'Guild Leader' : role === 'admin' ? 'Admin' : 'Traveler';
  return `${rankLabel(points)} ${roleName}`;
}

// What each rank unlocks. Discounts and min_rank rewards are enforced in
// redeem_guild_reward(); this is the copy shown in the app.
export const RANK_PERKS: Record<string, string[]> = {
  Rookie: ['Your first medal on your profile'],
  Bronze: ['Bronze medal shown next to your name everywhere'],
  Silver: ['Silver medal and a shinier profile chip'],
  Gold: ['Gold-only rewards unlock', 'Sunburst Gold medal'],
  Platinum: ['10% off every reward', 'Platinum-only rewards unlock', 'Sparkling medal'],
  Legend: ['20% off every reward', 'Legend-only rewards unlock', 'Animated Legend medal'],
};

export function rankDiscount(points: number) {
  const { index } = rankFor(points);
  return index >= 5 ? 20 : index >= 4 ? 10 : 0;
}

// Price after the rank discount plus the guild-level discount; must match
// redeem_guild_reward() (202610020007).
export function rewardPrice(cost: number, points: number, guildLevel = 0) {
  return Math.max(1, Math.ceil((cost * (100 - totalDiscount(points, guildLevel))) / 100));
}

// Rank + guild discount together never pass this, so rewards stay worth earning.
export const MAX_TOTAL_DISCOUNT = 25;
export function totalDiscount(points: number, guildLevel = 0) {
  return Math.min(MAX_TOTAL_DISCOUNT, rankDiscount(points) + guildPerkDiscount(guildLevel));
}

export function rankIndexOf(name: string | null | undefined) {
  return Math.max(0, RANKS.findIndex((rank) => rank.name === name));
}

export const GUILD_LEVEL_STEP = 500;
export function guildLevel(lifetimePoints: number) {
  return Math.floor(lifetimePoints / GUILD_LEVEL_STEP) + 1;
}

// Guild size: 10 at Level 1, +2 every 5 levels (Lv 6, 11, ...), up to 20
// (leader included). Mirrors guild_member_cap() in migration 202610020006.
export const GUILD_BASE_MEMBERS = 10;
export const GUILD_MEMBERS_PER_STEP = 2;
export const GUILD_LEVELS_PER_STEP = 5;
export const GUILD_MAX_MEMBERS = 20;
export function guildMemberCap(lifetimePoints: number) {
  const steps = Math.floor((guildLevel(lifetimePoints) - 1) / GUILD_LEVELS_PER_STEP);
  return Math.min(GUILD_MAX_MEMBERS, GUILD_BASE_MEMBERS + GUILD_MEMBERS_PER_STEP * steps);
}

// The next level that raises the cap (6, 11, 16, ...).
export function nextCapLevel(level: number) {
  return (Math.floor((level - 1) / GUILD_LEVELS_PER_STEP) + 1) * GUILD_LEVELS_PER_STEP + 1;
}

// ---------------------------------------------------------------------------
// Guild level perks (Clash of Clans style). Every member gets them. Mirrors
// guild_perk_discount() / guild_perk_mission_bonus() in 202610020007.
// ---------------------------------------------------------------------------

export type GuildPerkKind = 'members' | 'missions' | 'discount';
export type GuildPerk = { level: number; kind: GuildPerkKind; label: string };

// 3% off rewards at Lv 5, 6% at Lv 12, 10% at Lv 20.
export function guildPerkDiscount(level: number) {
  return level >= 20 ? 10 : level >= 12 ? 6 : level >= 5 ? 3 : 0;
}

// +10% mission points at Lv 3, +15% at 9, +20% at 15, +25% at 22.
export function guildMissionBonus(level: number) {
  return level >= 22 ? 25 : level >= 15 ? 20 : level >= 9 ? 15 : level >= 3 ? 10 : 0;
}

// A mission's payout with the bonus; rounds up like claim_mission() so small
// missions still get +1.
export function withMissionBonus(reward: number, level: number) {
  return reward + Math.ceil((reward * guildMissionBonus(level)) / 100);
}

function buildGuildPerks(): GuildPerk[] {
  const perks: GuildPerk[] = [];
  for (let level = 1; level <= 30; level += 1) {
    const before = Math.max(level - 1, 0);
    const lifetimeAt = (lvl: number) => (lvl - 1) * GUILD_LEVEL_STEP;
    if (level === 1 || guildMemberCap(lifetimeAt(level)) > guildMemberCap(lifetimeAt(before || 1))) {
      perks.push({ level, kind: 'members', label: `${guildMemberCap(lifetimeAt(level))} member slots` });
    }
    if (guildMissionBonus(level) > guildMissionBonus(before)) {
      perks.push({ level, kind: 'missions', label: `+${guildMissionBonus(level)}% mission points` });
    }
    if (guildPerkDiscount(level) > guildPerkDiscount(before)) {
      perks.push({ level, kind: 'discount', label: `${guildPerkDiscount(level)}% off every reward` });
    }
  }
  return perks;
}

export const GUILD_PERKS = buildGuildPerks();

// Unlocked perks, newest per kind -- what the guild has right now.
export function activeGuildPerks(level: number) {
  const latest = new Map<GuildPerkKind, GuildPerk>();
  for (const perk of GUILD_PERKS) if (perk.level <= level) latest.set(perk.kind, perk);
  return [...latest.values()];
}

export function nextGuildPerk(level: number) {
  return GUILD_PERKS.find((perk) => perk.level > level) ?? null;
}

// The caller's guild level; 0 when they're not in a guild.
export async function getMyGuildLevel() {
  const result = await run<number>(supabase.rpc('get_my_guild_level'), 'Loading guild level', 0);
  return { ...result, data: num(result.data) };
}

export type BadgeIcon = 'verified' | 'guild' | 'car' | 'road' | 'host' | 'crown' | 'gate' | 'recruit';

// Single-goal badges have one threshold; tiered ones go bronze -> silver -> gold.
export type Badge = {
  id: string;
  name: string;
  icon: BadgeIcon;
  // 0 = locked; otherwise 1..thresholds.length.
  tier: number;
  thresholds: number[];
  count: number;
  earned: boolean;
  // "Complete 15 trips", or a done message at max tier.
  description: string;
  // One requirement per tier, e.g. ["Complete 10 trips", "Complete 25 trips", ...].
  requirements: string[];
  // Where in the app you go to make progress.
  how: string;
};

type BadgeDef = { id: string; name: string; icon: BadgeIcon; thresholds: number[]; goal: (n: number) => string; how: string; count: number; leaderOnly?: boolean };

// Travelers don't see badges only Guild Leaders can earn.
export function badgesFor(summary: PointsSummary | null, role?: string | null): Badge[] {
  const count = (reason: string) => summary?.reason_counts?.[reason] ?? 0;
  const trips = count('trip_completed') + count('trip_hosted');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const defs: BadgeDef[] = [
    { id: 'verified', name: 'Verified', icon: 'verified', thresholds: [1], goal: () => 'Get your ID approved', how: 'Submit your ID for verification. It counts once an admin approves it.', count: count('id_verified') },
    { id: 'guildmate', name: 'Guildmate', icon: 'guild', thresholds: [1], goal: () => 'Join a guild', how: 'Open the Guilds leaderboard and join or request to join a guild.', count: count('guild_joined') + count('guild_founded') },
    { id: 'first-ride', name: 'First Ride', icon: 'car', thresholds: [1], goal: () => 'Complete a trip', how: 'Join a carpool or tour and finish the trip.', count: trips },
    { id: 'road-warrior', name: 'Road Warrior', icon: 'road', thresholds: [10, 25, 50], goal: (n) => `Complete ${plural(n, 'trip')}`, how: 'Every carpool or tour you finish, as a rider or host, counts.', count: trips },
    { id: 'host', name: 'Trip Host', icon: 'host', thresholds: [5, 15, 40], goal: (n) => `Host ${plural(n, 'completed trip')}`, how: 'Create a carpool or tour and see it through to the end.', count: count('trip_hosted') },
    { id: 'founder', name: 'Guild Founder', icon: 'crown', thresholds: [1], goal: () => 'Found a guild', how: 'Get approved as a Guild Leader, then create your guild.', count: count('guild_founded'), leaderOnly: true },
    { id: 'recruiter', name: 'Recruiter', icon: 'recruit', thresholds: [5, 15, 40], goal: (n) => `Welcome ${plural(n, 'member')} to your guild`, how: 'Invite travelers or accept join requests to your guild.', count: count('guild_recruit'), leaderOnly: true },
  ];

  const visible = role === 'traveler' ? defs.filter((def) => !def.leaderOnly) : defs;
  return visible.map((def) => {
    const tier = def.thresholds.filter((t) => def.count >= t).length;
    const nextTarget = def.thresholds[tier];
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      tier,
      thresholds: def.thresholds,
      count: def.count,
      earned: tier > 0,
      description: nextTarget === undefined ? 'Fully earned!' : `${def.goal(nextTarget)}${def.thresholds.length > 1 ? ` (${def.count}/${nextTarget})` : ''}`,
      requirements: def.thresholds.map((threshold) => def.goal(threshold)),
      how: def.how,
    };
  });
}

// ---------------------------------------------------------------------------
// Season medals: top 3 players and guilds each month.
// ---------------------------------------------------------------------------

export type SeasonAward = {
  id: string;
  // First day of the month, YYYY-MM-DD.
  season: string;
  board: 'player' | 'guild';
  place: 1 | 2 | 3;
  name: string;
  points: number;
  guild_id: string | null;
};

export async function getSeasonAwards(userId?: string) {
  const result = await run<SeasonAward[]>(
    supabase.rpc('get_season_awards', userId ? { p_user_id: userId } : {}),
    'Loading season medals',
    []
  );
  return { ...result, data: result.data.map((row) => ({ ...row, points: num(row.points) })) };
}

// Season medals a guild has won (guild board only), newest first.
export async function getGuildSeasonAwards(guildId: string) {
  const result = await run<SeasonAward[]>(
    supabase
      .from('guild_season_awards')
      .select('id, season, board, place, name, points, guild_id')
      .eq('guild_id', guildId)
      .eq('board', 'guild')
      .order('season', { ascending: false }),
    'Loading guild medals',
    []
  );
  return { ...result, data: result.data.map((row) => ({ ...row, points: num(row.points) })) };
}

// Awards last month's medals if the monthly job hasn't yet. Safe to call on
// every open: the server skips places that are already awarded.
export async function ensureSeasonAwards() {
  return run<number>(supabase.rpc('award_season_medals'), 'Awarding season medals', 0);
}

// "Oct 2026"
export function seasonLabel(season: string) {
  const [year, month] = season.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export type RankInfo = { user_id: string; role: string; lifetime_points: number };

export async function getRankInfo(userIds: string[]) {
  const result = await run<RankInfo[]>(supabase.rpc('get_rank_info', { p_user_ids: userIds }), 'Loading ranks', []);
  return { ...result, data: result.data.map((row) => ({ ...row, lifetime_points: num(row.lifetime_points) })) };
}

export const REASON_LABELS: Record<string, string> = {
  id_review: 'Reviewed an ID',
  vehicle_review: 'Reviewed a vehicle',
  report_resolved: 'Resolved a report',
  report_dismissed: 'Closed a report',
  sos_resolved: 'Resolved an SOS',
  trip_completed: 'Completed a trip',
  trip_hosted: 'Hosted a trip',
  guild_trip_bonus: 'Guild trip bonus',
  guild_joined: 'Joined a guild',
  guild_founded: 'Founded a guild',
  id_verified: 'ID verified',
  redemption: 'Redeemed a reward',
  redemption_refund: 'Reward refunded',
  admin_adjustment: 'Adjustment by admin',
  mission_reward: 'Mission complete',
  review_overturned: 'Review overturned by admin',
  guild_recruit: 'New guild member',
};

// How to earn, shown on the guild screen so everyone knows the goals.
// `once` marks one-time awards, which can't be repeated to climb ranks.
export const EARNING_GUIDE: { role: 'guild_leader' | 'traveler'; label: string; points: number; once?: boolean }[] = [
  { role: 'guild_leader', label: 'A new member joins your guild', points: 5 },
  { role: 'guild_leader', label: 'A guild member finishes a trip', points: 5 },
  { role: 'guild_leader', label: 'Found your guild', points: 50, once: true },
  { role: 'traveler', label: 'Get your ID verified', points: 50, once: true },
  { role: 'traveler', label: 'Host a completed trip', points: 30 },
  { role: 'traveler', label: 'Complete a trip', points: 20 },
  { role: 'traveler', label: 'Join a guild', points: 10, once: true },
];

// Mirrors the guilds.emblem check in migration 202610020009.
export const GUILD_EMBLEMS: GuildEmblem[] = [
  'shield', 'flame', 'mountain', 'compass', 'star', 'wave', 'leaf', 'crown',
  'car', 'bike', 'tent', 'trees', 'sun', 'palm', 'anchor', 'plane', 'camera', 'utensils', 'heart', 'bolt',
];
export const GUILD_COLORS = ['#2563EB', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#1E293B'];

// Bulacan-flavored name ideas for leaders founding a guild.
export const GUILD_NAME_IDEAS = [
  'Malolos Wanderers',
  'Biak-na-Bato Trailblazers',
  'Baliwag Road Crew',
  'Meycauayan Nomads',
  'Pulilan Pathfinders',
  'Hagonoy River Riders',
  'Sierra Madre Seekers',
  'San Jose Del Monte Convoy',
];

// ---------------------------------------------------------------------------
// Guild colors. White text and emblems sit on the guild color, so a custom
// color must give white at least 3:1 contrast. Mirrors guild_color_readable()
// in migration 202610020009.
// ---------------------------------------------------------------------------

export function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function isReadableOnWhite(hex: string) {
  if (!isHexColor(hex)) return false;
  const luminance = [1, 3, 5].reduce((sum, start, index) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    const linear = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return sum + [0.2126, 0.7152, 0.0722][index] * linear;
  }, 0);
  return 1.05 / (luminance + 0.05) >= 3;
}

// h 0-360, s and l 0-100.
export function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

export function hexToHsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
