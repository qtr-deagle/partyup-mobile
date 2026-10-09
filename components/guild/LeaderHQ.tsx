import { GuildEmblem } from '@/components/GuildEmblem';
import { MISSION_ICONS } from '@/components/guild/MissionsPanel';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { GUILD_LEVEL_STEP, guildLevel, guildMemberCap, withMissionBonus, type Guild } from '@/lib/guilds';
import { getMyMissions, missionState, timeLeft, type Mission } from '@/lib/missions';
import { getTheme } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Check,
  ChevronRight,
  Clock,
  Coins,
  Crown,
  Flag,
  type LucideIcon,
  MessageCircle,
  PartyPopper,
  Pencil,
  ScrollText,
  Sparkles,
  UserPlus,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// The leader's view of My Guild, in three blocks the panel places itself:
// LeaderHero (guild at a glance), CommandCenter (leader tools) and
// LeaderMissionsCard (this week's leader missions).

const MISSION_GOLD = '#D97706';

type HeroProps = {
  guild: Guild;
  memberCount: number;
  // Guild lifetime points (sets level and member cap).
  lifetimePoints: number;
  // Guild points and board position for the selected period.
  periodPoints: number;
  periodRank: number | null;
  periodLabel: string;
  onEdit: () => void;
};

export function LeaderHero({ guild, memberCount, lifetimePoints, periodPoints, periodRank, periodLabel, onEdit }: HeroProps) {
  const router = useRouter();
  const level = guildLevel(lifetimePoints);
  const cap = guildMemberCap(lifetimePoints);
  const intoLevel = lifetimePoints % GUILD_LEVEL_STEP;

  return (
    <Animated.View key="leader-hero" entering={riseIn(0, 420)} className="overflow-hidden rounded-[24px] p-5" style={{ backgroundColor: guild.color }}>
      <View className="absolute -right-14 -top-16 h-52 w-52 rounded-full bg-white/10" />
      <View className="absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-black/15" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
          <Crown size={13} color="#FDE68A" />
          <Text className="text-[11px] font-black uppercase tracking-[2px] text-[#FDE68A]">Leader HQ</Text>
        </View>
        <AnimatedPressable onPress={onEdit} className="flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5" accessibilityLabel="Edit guild">
          <Pencil size={13} color="#FFFFFF" />
          <Text className="text-xs font-bold text-white">Edit</Text>
        </AnimatedPressable>
      </View>

      <View className="mt-4 flex-row items-center gap-3.5">
        <View className="rounded-full border-2 border-white/40 p-1">
          <GuildEmblem emblem={guild.emblem} color="rgba(0,0,0,0.18)" size={58} />
        </View>
        <View className="flex-1">
          <Text className="text-[22px] font-black text-white" numberOfLines={1}>
            {guild.name}
          </Text>
          {guild.tagline ? (
            <Text className="text-sm text-white/75" numberOfLines={1}>
              {guild.tagline}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Level progress */}
      <View className="mt-4">
        <View className="flex-row items-end justify-between">
          <Text className="text-sm font-black text-white">Level {level}</Text>
          <Text className="text-[11px] font-semibold text-white/70">
            {GUILD_LEVEL_STEP - intoLevel} pts to Level {level + 1}
          </Text>
        </View>
        <FillBar pct={intoLevel / GUILD_LEVEL_STEP} color="#FFFFFF" track="rgba(255,255,255,0.22)" />
      </View>

      <View className="mt-4 flex-row gap-2">
        <HeroTile label="Members" value={`${memberCount}/${cap}`} />
        <HeroTile label={`Rank · ${periodLabel}`} value={periodRank ? `#${periodRank}` : '—'} />
        <HeroTile label={`Pts · ${periodLabel}`} value={periodPoints.toLocaleString()} />
      </View>

      <AnimatedPressable
        onPress={() => router.push({ pathname: '/guild/[id]', params: { id: guild.id } })}
        scaleTo={0.98}
        className="mt-4 flex-row items-center justify-between rounded-2xl bg-white/15 px-4 py-3"
        accessibilityLabel={`Open ${guild.name}'s Guild Hall`}>
        <Text className="text-sm font-bold text-white">Open Guild Hall</Text>
        <ChevronRight size={18} color="#FFFFFF" />
      </AnimatedPressable>
    </Animated.View>
  );
}

function HeroTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-white/10 px-1 py-2.5">
      <Text className="text-lg font-black text-white" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-white/70" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

type CommandProps = {
  isDark: boolean;
  guild: Guild;
  joinRequests: number;
  openReports: number;
  stepDownBusy: boolean;
  onReports: () => void;
  onAudit: () => void;
  onEdit: () => void;
  onStepDown: () => void;
};

type Tool = { id: string; label: string; detail: string; icon: LucideIcon; color: string; count?: number; onPress: () => void };

export function CommandCenter({ isDark, guild, joinRequests, openReports, stepDownBusy, onReports, onAudit, onEdit, onStepDown }: CommandProps) {
  const router = useRouter();
  const { primaryText, mutedText, mutedPanel } = getTheme(isDark);

  const tools: Tool[] = [
    {
      id: 'requests',
      label: 'Requests',
      detail: joinRequests > 0 ? `${joinRequests} waiting` : 'All clear',
      icon: UserPlus,
      color: '#284BD6',
      count: joinRequests,
      onPress: () => router.push({ pathname: '/guild/requests', params: { guildId: guild.id } }),
    },
    { id: 'reports', label: 'Reports', detail: openReports > 0 ? `${openReports} open` : 'All clear', icon: Flag, color: '#DC2626', count: openReports, onPress: onReports },
    {
      id: 'partyup',
      label: 'PartyUp',
      detail: 'Plan a hangout',
      icon: PartyPopper,
      color: '#7C3AED',
      onPress: () => router.push({ pathname: '/guild/partyup', params: { guildId: guild.id, guildName: guild.name } }),
    },
    { id: 'chat', label: 'Guild chat', detail: 'Talk to all', icon: MessageCircle, color: '#059669', onPress: () => router.push('/guild/chat') },
    { id: 'edit', label: 'Settings', detail: 'Name, rules, look', icon: Pencil, color: '#0891B2', onPress: onEdit },
    { id: 'audit', label: 'Audit log', detail: 'Who did what', icon: ScrollText, color: '#64748B', onPress: onAudit },
  ];

  return (
    <Card key="command-center" index={1}>
      <Text className={`text-base font-black ${primaryText}`}>Command Center</Text>
      <Text className={`text-xs ${mutedText}`}>Everything you run as Guild Leader</Text>

      <View className="mt-3 flex-row flex-wrap justify-between gap-y-2.5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const count = tool.count ?? 0;
          return (
            <AnimatedPressable
              key={tool.id}
              onPress={tool.onPress}
              scaleTo={0.95}
              className={`w-[31.5%] rounded-2xl p-3 ${mutedPanel}`}
              accessibilityLabel={count > 0 ? `${tool.label}, ${tool.detail}` : tool.label}>
              <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${tool.color}1F` }}>
                <Icon size={19} color={tool.color} />
              </View>
              <Text className={`mt-2 text-[13px] font-black ${primaryText}`} numberOfLines={1}>
                {tool.label}
              </Text>
              <Text className={`text-[10px] ${count > 0 ? 'font-bold' : mutedText}`} style={count > 0 ? { color: tool.color } : undefined} numberOfLines={1}>
                {tool.detail}
              </Text>
              {count > 0 ? (
                <View key="count" className="absolute right-2 top-2 min-w-[20px] items-center rounded-full bg-[#DC2626] px-1.5 py-0.5">
                  <Text className="text-[10px] font-black text-white">{count}</Text>
                </View>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>

      <AnimatedPressable
        onPress={onStepDown}
        disabled={stepDownBusy}
        scaleTo={0.97}
        className="mt-3 flex-row items-center justify-center gap-1.5 py-1"
        accessibilityLabel="Step down as Guild Leader">
        {stepDownBusy ? <ActivityIndicator color={isDark ? '#94A3B8' : '#67748D'} /> : <Crown size={13} color={isDark ? '#94A3B8' : '#67748D'} />}
        <Text className={`text-xs font-semibold ${mutedText}`}>Step down as leader</Text>
      </AnimatedPressable>
    </Card>
  );
}

type MissionsProps = {
  isDark: boolean;
  // Guild lifetime points, for the level perk added to each reward.
  guildLifetimePoints: number;
  // Bumped by the panel on pull-to-refresh.
  refreshKey: number;
  onOpenMissions: () => void;
};

// This week's leader missions (category 'leader', migration 202610090008).
// Claiming happens on the Mission Board, so every row opens it.
export function LeaderMissionsCard({ isDark, guildLifetimePoints, refreshKey, onOpenMissions }: MissionsProps) {
  const { primaryText, mutedText, mutedPanel } = getTheme(isDark);
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Reloads on focus and whenever the panel bumps refreshKey.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getMyMissions().then(({ data }) => {
        if (!alive) return;
        setMissions(data.filter((mission) => mission.category === 'leader'));
        setNow(Date.now());
      });
      return () => {
        alive = false;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey is the reload trigger
    }, [refreshKey])
  );

  // Nothing to show until loaded, or if the leader catalog isn't deployed.
  if (!missions || missions.length === 0) return null;

  const level = guildLevel(guildLifetimePoints);
  const done = missions.filter((mission) => mission.claimed).length;
  const ready = missions.filter((mission) => missionState(mission) === 'claimable');
  const readyPoints = ready.reduce((sum, mission) => sum + withMissionBonus(mission.reward, level), 0);
  const reset = timeLeft(missions[0].resets_at, now);
  const sorted = [...missions].sort((a, b) => stateOrder(a) - stateOrder(b) || b.progress / b.target - a.progress / a.target);

  return (
    <Card key="leader-missions" index={2}>
      <View className="flex-row items-center gap-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: MISSION_GOLD }}>
          <Crown size={18} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className={`text-base font-black ${primaryText}`}>Leader Missions</Text>
          <Text className={`text-xs ${mutedText}`}>
            {done}/{missions.length} done this week
          </Text>
        </View>
        {reset ? (
          <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${mutedPanel}`}>
            <Clock size={11} color={isDark ? '#94A3B8' : '#67748D'} />
            <Text className={`text-[11px] font-bold ${mutedText}`}>{reset}</Text>
          </View>
        ) : null}
      </View>

      {/* Week progress across all leader missions */}
      <View className="mt-3 flex-row gap-1">
        {missions.map((mission) => (
          <View
            key={mission.key}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: mission.claimed ? '#10B981' : missionState(mission) === 'claimable' ? MISSION_GOLD : isDark ? '#22324B' : '#E2E8F0' }}
          />
        ))}
      </View>

      {ready.length > 0 ? (
        <AnimatedPressable key="claim-banner" onPress={onOpenMissions} className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl bg-[#FBBF24] py-3">
          <Sparkles size={16} color="#422006" />
          <Text className="text-sm font-black text-[#422006]">
            {ready.length} ready · claim +{readyPoints} pts
          </Text>
        </AnimatedPressable>
      ) : null}

      <View className="mt-3 gap-2">
        {sorted.map((mission) => (
          <LeaderMissionRow key={mission.key} mission={mission} reward={withMissionBonus(mission.reward, level)} isDark={isDark} onPress={onOpenMissions} />
        ))}
      </View>

      <AnimatedPressable onPress={onOpenMissions} scaleTo={0.97} className="mt-3 flex-row items-center justify-center gap-1 py-1">
        <Text className="text-sm font-bold" style={{ color: MISSION_GOLD }}>
          Open Mission Board
        </Text>
        <ChevronRight size={16} color={MISSION_GOLD} />
      </AnimatedPressable>
    </Card>
  );
}

function LeaderMissionRow({ mission, reward, isDark, onPress }: { mission: Mission; reward: number; isDark: boolean; onPress: () => void }) {
  const { primaryText, mutedText, mutedPanel } = getTheme(isDark);
  const state = missionState(mission);
  const Icon = MISSION_ICONS[mission.icon] ?? Flag;
  const shown = Math.min(mission.progress, mission.target);
  const tint = state === 'claimed' ? '#10B981' : MISSION_GOLD;

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.98}
      className={`flex-row items-center gap-3 rounded-2xl border p-3 ${mutedPanel}`}
      style={{ borderColor: state === 'claimable' ? MISSION_GOLD : 'transparent' }}
      accessibilityLabel={`${mission.title}, ${shown} of ${mission.target}`}>
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${tint}22` }}>
        {state === 'claimed' ? <Check size={18} color={tint} strokeWidth={3} /> : <Icon size={18} color={tint} />}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className={`flex-1 text-sm font-black ${primaryText}`} numberOfLines={1} style={state === 'claimed' ? { opacity: 0.6 } : undefined}>
            {mission.title}
          </Text>
          <View className="flex-row items-center gap-0.5">
            <Coins size={11} color="#CA8A04" />
            <Text className="text-[11px] font-black text-[#B45309]">+{reward}</Text>
          </View>
        </View>
        <Text className={`text-[11px] ${mutedText}`} numberOfLines={1}>
          {mission.description}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-2">
          <View className="flex-1">
            <FillBar pct={state === 'claimed' ? 1 : shown / mission.target} color={tint} track={isDark ? '#22324B' : '#E2E8F0'} thin />
          </View>
          <Text className={`min-w-[30px] text-right text-[11px] font-black ${state === 'claimable' ? '' : mutedText}`} style={state === 'claimable' ? { color: MISSION_GOLD } : undefined}>
            {state === 'claimed' ? 'Done' : `${shown}/${mission.target}`}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function stateOrder(mission: Mission) {
  return { claimable: 0, active: 1, locked: 2, claimed: 3 }[missionState(mission)];
}

// Fills from 0 to pct when it appears or changes.
function FillBar({ pct, color, track, thin = false }: { pct: number; color: string; track: string; thin?: boolean }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.set(withTiming(Math.max(0, Math.min(1, pct)) * 100, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [pct, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.get()}%` }));

  return (
    <View className={`${thin ? 'h-1.5' : 'mt-1.5 h-2'} overflow-hidden rounded-full`} style={{ backgroundColor: track }}>
      <Animated.View className="h-full rounded-full" style={[{ backgroundColor: color }, style]} />
    </View>
  );
}
