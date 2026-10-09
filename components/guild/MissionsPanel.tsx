import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn, SkeletonRow, SuccessOverlay } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { invalidateRankInfo } from '@/hooks/use-rank-info';
import { getMyGuildLevel, guildMissionBonus, withMissionBonus } from '@/lib/guilds';
import { useAuth } from '@/hooks/auth-provider';
import { listCosmetics, type Cosmetic } from '@/lib/cosmetics';
import { claimableCount, claimMission, collapseChains, getMyMissions, missionState, timeLeft, type Mission, type MissionCategory } from '@/lib/missions';
import { getTheme } from '@/lib/theme';
import { useFocusEffect } from 'expo-router';
import {
  BadgeCheck,
  Camera,
  Car,
  Check,
  ClipboardCheck,
  Clock,
  Coins,
  Crown,
  Flag,
  Heart,
  Home,
  Lock,
  Map,
  MessageCircle,
  Palette,
  Route,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  User,
  UserPlus,
  Users,
  type LucideIcon,
  ChevronDown,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
export const MISSION_ICONS: Record<string, LucideIcon> = {
  car: Car,
  route: Route,
  star: Star,
  users: Users,
  message: MessageCircle,
  clipboard: ClipboardCheck,
  crown: Crown,
  flag: Flag,
  trophy: Trophy,
  map: Map,
  home: Home,
  heart: Heart,
  'user-plus': UserPlus,
  shield: Shield,
  badge: BadgeCheck,
  camera: Camera,
};

// Monthly missions were retired (202610030001); the board is Leader (Guild
// Leaders only, 202610090008), Individual, Guild and Milestones. Empty
// sections are skipped.
const SECTIONS: { id: MissionCategory; title: string; color: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'leader', title: 'Leader Duties', color: '#D97706', icon: Crown, blurb: 'Weekly goals for running your guild · resets Monday' },
  { id: 'weekly', title: 'Individual', color: '#284BD6', icon: User, blurb: 'Your own goals and what you add to your guild · resets Monday' },
  { id: 'guild', title: 'Guild Contribution', color: '#7C3AED', icon: Swords, blurb: 'Shared goals for the whole guild; everyone claims' },
  { id: 'milestone', title: 'Milestones', color: '#CA8A04', icon: Trophy, blurb: 'Lifetime goals; top steps unlock banners and frames' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// Longer sections show this many cards until expanded.
const SECTION_PREVIEW = 5;

const WEEKLY_CATEGORIES: MissionCategory[] = ['weekly', 'guild', 'leader'];

type Props = {
  isDark: boolean;
  // Switches the Guild screen to the Leaderboard (where Join lives).
  onFindGuild: () => void;
  // Lets the Guild screen refresh its "ready to claim" count.
  onChanged?: () => void;
};

// The Mission Board: individual, guild contribution and milestone missions with
// live progress and claimable rewards. Progress and payouts are server-side.
export function MissionsPanel({ isDark, onFindGuild, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { primaryColor, primaryText, mutedText } = getTheme(isDark);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionBonus, setMissionBonus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [reward, setReward] = useState<{ points: number; title: string; unlocked?: string } | null>(null);
  // Mission key -> the banner/frame claiming it unlocks.
  const [unlocks, setUnlocks] = useState<Record<string, Cosmetic>>({});
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<MissionCategory[]>([]);
  const clearReward = useCallback(() => setReward(null), []);

  const load = useCallback(async () => {
    const [{ data, error }, levelResult, cosmeticsResult] = await Promise.all([getMyMissions(), getMyGuildLevel(), listCosmetics()]);
    setUnlocks(Object.fromEntries(cosmeticsResult.data.filter((item) => item.unlock_mission).map((item) => [item.unlock_mission as string, item])));
    setErrorMessage(error?.message ?? levelResult.error?.message ?? null);
    // Show rewards with the guild-level perk already added, matching what
    // claim_mission() pays out (202610020007).
    setMissionBonus(guildMissionBonus(levelResult.data));
    setMissions(data.map((mission) => ({ ...mission, reward: withMissionBonus(mission.reward, levelResult.data) })));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Keep the reset countdowns ticking.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function claim(mission: Mission) {
    setClaimingKey(mission.key);
    const { data, error } = await claimMission(mission.key);
    setClaimingKey(null);
    if (error) {
      showAlert('Could not claim', error.message);
      await load();
      return;
    }
    setMissions((current) => current.map((row) => (row.key === mission.key ? { ...row, claimed: true } : row)));
    if (profile?.id) invalidateRankInfo(profile.id);
    setReward({ points: data, title: mission.title, unlocked: unlocks[mission.key]?.name });
    onChanged?.();
  }

  async function claimAll() {
    const ready = missions.filter((mission) => missionState(mission) === 'claimable');
    setClaimingKey('all');
    let total = 0;
    for (const mission of ready) {
      const { data, error } = await claimMission(mission.key);
      if (!error) total += data;
    }
    setClaimingKey(null);
    await load();
    if (profile?.id) invalidateRankInfo(profile.id);
    if (total > 0) setReward({ points: total, title: `${ready.length} missions` });
    onChanged?.();
  }

  const ready = claimableCount(missions);
  const readyPoints = missions.filter((mission) => missionState(mission) === 'claimable').reduce((sum, mission) => sum + mission.reward, 0);
  const weekly = missions.filter((mission) => WEEKLY_CATEGORIES.includes(mission.category) && !mission.locked);
  const weeklyDone = weekly.filter((mission) => mission.claimed).length;
  const weeklyReset = timeLeft(weekly[0]?.resets_at ?? missions.find((mission) => mission.resets_at)?.resets_at ?? null, now);
  const openPoints = missions.filter((mission) => !mission.claimed && !mission.locked).reduce((sum, mission) => sum + mission.reward, 0);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
      {errorMessage ? (
        <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
          <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
        </View>
      ) : null}

      {/* Mission Board hero */}
      <Animated.View key="hero" entering={riseIn(0, 420)} className="overflow-hidden rounded-[24px] bg-[#1E2A78] p-5">
        <View className="absolute -right-12 -top-14 h-48 w-48 rounded-full bg-white/10" />
        <View className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[#7C3AED]/40" />
        <View className="flex-row items-center gap-2">
          <Target size={20} color="#FDE68A" />
          <Text className="text-xs font-black uppercase tracking-[3px] text-[#FDE68A]">Mission Board</Text>
        </View>
        <Text className="mt-2 text-[24px] font-black text-white">{ready > 0 ? `${ready} ${ready === 1 ? 'reward' : 'rewards'} ready!` : 'Keep exploring'}</Text>
        <Text className="mt-0.5 text-sm text-white/75">
          {weeklyReset ? `Weekly missions reset in ${weeklyReset}` : 'Complete missions to earn bonus points'}
        </Text>
        {missionBonus > 0 ? (
          <Text className="mt-1 text-xs font-bold text-[#FDE68A]">Guild perk: +{missionBonus}% on every mission (included below)</Text>
        ) : null}

        <View className="mt-4 flex-row gap-2">
          <HeroStat label="This week" value={`${weeklyDone}/${weekly.length}`} />
          <HeroStat label="Ready" value={`+${readyPoints}`} highlight={readyPoints > 0} />
          <HeroStat label="Up for grabs" value={`${openPoints}`} />
        </View>

        {ready > 0 ? (
          <AnimatedPressable
            onPress={() => void claimAll()}
            disabled={claimingKey !== null}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-[#FBBF24] py-3.5">
            {claimingKey === 'all' ? <ActivityIndicator color="#422006" /> : <Sparkles size={18} color="#422006" />}
            <Text className="text-base font-black text-[#422006]">
              Claim all · +{readyPoints} pts
            </Text>
          </AnimatedPressable>
        ) : null}
      </Animated.View>

      {loading ? (
        <Card key="loading">
          {[0, 1, 2, 3].map((index) => (
            <SkeletonRow key={index} />
          ))}
        </Card>
      ) : (
        <View key="sections" className="gap-5">
          {SECTIONS.map((section, sectionIndex) => {
            const rows = collapseChains(missions.filter((mission) => mission.category === section.id)).sort(
              (a, b) => stateOrder(a.mission) - stateOrder(b.mission) || ratio(b.mission) - ratio(a.mission)
            );
            if (rows.length === 0) return null;
            const allLocked = rows.every((row) => row.mission.locked);
            const reset = WEEKLY_CATEGORIES.includes(section.id) ? timeLeft(rows[0].mission.resets_at, now) : null;
            const SectionIcon = section.icon;
            return (
              <View key={section.id} className="gap-2.5">
                <View className="flex-row items-center gap-2 px-1">
                  <View className="h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: section.color }}>
                    <SectionIcon size={15} color="#FFFFFF" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-base font-black ${primaryText}`}>{section.title}</Text>
                    <Text className={`text-[11px] ${mutedText}`}>{section.blurb}</Text>
                  </View>
                  {reset ? (
                    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF2FA]'}`}>
                      <Clock size={11} color={isDark ? '#94A3B8' : '#67748D'} />
                      <Text className={`text-[11px] font-bold ${mutedText}`}>{reset}</Text>
                    </View>
                  ) : null}
                </View>

                {allLocked ? (
                  <AnimatedPressable
                    key="locked"
                    onPress={onFindGuild}
                    className="flex-row items-center gap-3 rounded-[20px] border-2 border-dashed p-4"
                    style={{ borderColor: `${section.color}66` }}>
                    <Lock size={20} color={section.color} />
                    <View className="flex-1">
                      <Text className={`text-sm font-black ${primaryText}`}>Join a guild to unlock {section.title.toLowerCase()} missions</Text>
                      <Text className={`text-xs ${mutedText}`}>
                        {rows.length} shared goals worth +{rows.reduce((sum, row) => sum + row.mission.reward, 0)} pts each week
                      </Text>
                    </View>
                  </AnimatedPressable>
                ) : (
                  <View key="rows" className="gap-2.5">
                    {/* Sorted ready-first, so the hidden ones are in progress or done. */}
                    {(expanded.includes(section.id) ? rows : rows.slice(0, SECTION_PREVIEW)).map((row, index) => (
                      <MissionCard
                        key={row.mission.chain ?? row.mission.key}
                        mission={row.mission}
                        steps={row.steps}
                        color={section.color}
                        unlock={unlocks[row.mission.key] ?? null}
                        isDark={isDark}
                        index={sectionIndex * 3 + index}
                        claiming={claimingKey === row.mission.key || claimingKey === 'all'}
                        onClaim={() => void claim(row.mission)}
                      />
                    ))}
                    {rows.length > SECTION_PREVIEW && !expanded.includes(section.id) ? (
                      <AnimatedPressable
                        key="more"
                        onPress={() => setExpanded((current) => [...current, section.id])}
                        scaleTo={0.97}
                        className="flex-row items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed py-3"
                        style={{ borderColor: `${section.color}55` }}>
                        <Text className="text-sm font-bold" style={{ color: section.color }}>
                          Show {rows.length - SECTION_PREVIEW} more
                        </Text>
                        <ChevronDown size={16} color={section.color} />
                      </AnimatedPressable>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <SuccessOverlay
        visible={reward !== null}
        title={`+${reward?.points ?? 0} pts!`}
        message={reward?.unlocked ? `${reward.title} complete · ${reward.unlocked} unlocked! Wear it from Rewards.` : `${reward?.title ?? 'Mission'} complete`}
        onDone={clearReward}
      />
    </ScrollView>
  );
}

function stateOrder(mission: Mission) {
  return { claimable: 0, active: 1, locked: 2, claimed: 3 }[missionState(mission)];
}

function ratio(mission: Mission) {
  return Math.min(1, mission.progress / mission.target);
}

function HeroStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-white/10 py-2.5">
      <Text className={`text-lg font-black ${highlight ? 'text-[#FDE68A]' : 'text-white'}`}>{value}</Text>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-white/65">{label}</Text>
    </View>
  );
}

type CardProps = {
  mission: Mission;
  steps: Mission[];
  color: string;
  // Cosmetic this mission unlocks, if any.
  unlock: Cosmetic | null;
  isDark: boolean;
  index: number;
  claiming: boolean;
  onClaim: () => void;
};

function MissionCard({ mission, steps, color, unlock, isDark, index, claiming, onClaim }: CardProps) {
  const state = missionState(mission);
  const Icon = MISSION_ICONS[mission.icon] ?? Flag;
  const shown = Math.min(mission.progress, mission.target);
  const pct = mission.target > 0 ? shown / mission.target : 0;
  const primaryText = isDark ? 'text-white' : 'text-[#182847]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const isChain = steps.length > 1;

  return (
    // The entrance fades opacity, so the "claimed" dimming lives on an inner view —
    // a static opacity next to a layout animation gets overwritten (and Reanimated warns).
    <Animated.View entering={riseIn(Math.min(index, 8) * 50, 380)}>
      <View
        className={`overflow-hidden rounded-[20px] border-2 p-3.5 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}
        style={{
          borderColor: state === 'claimable' ? color : isDark ? '#22324B' : '#E9EDF5',
          opacity: state === 'claimed' ? 0.6 : 1,
        }}>
        {state === 'claimable' ? <ReadyGlow color={color} /> : null}

        <View className="flex-row items-start gap-3">
          <View
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: state === 'claimed' ? '#10B981' : state === 'locked' ? (isDark ? '#334155' : '#CBD5E1') : color }}>
            {state === 'claimed' ? <Check size={22} color="#FFFFFF" strokeWidth={3} /> : <Icon size={22} color="#FFFFFF" />}
          </View>

          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className={`flex-1 text-[15px] font-black ${primaryText}`} numberOfLines={1}>
                {mission.title}
              </Text>
              <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: isDark ? '#3A2E0B' : '#FEF3C7' }}>
                <Coins size={12} color="#CA8A04" />
                <Text className="text-xs font-black text-[#B45309]">+{mission.reward}</Text>
              </View>
            </View>
            <Text className={`mt-0.5 text-xs ${mutedText}`}>{mission.description}</Text>
            {unlock && state !== 'claimed' ? (
              <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full px-2 py-0.5" style={{ backgroundColor: isDark ? '#2E1065' : '#F3E8FF' }}>
                <Palette size={11} color="#7C3AED" />
                <Text className="text-[11px] font-bold text-[#7C3AED]">
                  Unlocks {unlock.kind === 'banner' ? 'banner' : 'frame'}: {unlock.name}
                </Text>
              </View>
            ) : null}

            {isChain ? (
              <View className="mt-2 flex-row gap-1.5">
                {steps.map((step, stepIndex) => {
                  const done = step.claimed;
                  const current = step.key === mission.key && !done;
                  return (
                    <View
                      key={step.key}
                      className="h-5 min-w-[26px] items-center justify-center rounded-md px-1"
                      style={{
                        backgroundColor: done ? color : current ? `${color}22` : isDark ? '#1E293B' : '#F1F5F9',
                        borderWidth: current ? 1.5 : 0,
                        borderColor: color,
                      }}>
                      <Text className="text-[10px] font-black" style={{ color: done ? '#FFFFFF' : current ? color : isDark ? '#64748B' : '#94A3B8' }}>
                        {ROMAN[stepIndex] ?? stepIndex + 1}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {state !== 'locked' ? (
              <View className="mt-2.5 flex-row items-center gap-2">
                <ProgressBar pct={state === 'claimed' ? 1 : pct} color={state === 'claimed' ? '#10B981' : color} isDark={isDark} />
                <Text className={`min-w-[44px] text-right text-xs font-black ${state === 'claimable' ? '' : mutedText}`} style={state === 'claimable' ? { color } : undefined}>
                  {shown}/{mission.target}
                </Text>
              </View>
            ) : (
              <View className="mt-2 flex-row items-center gap-1">
                <Lock size={12} color={isDark ? '#94A3B8' : '#67748D'} />
                <Text className={`text-xs ${mutedText}`}>Join a guild to unlock</Text>
              </View>
            )}
          </View>
        </View>

        {state === 'claimable' ? (
          <AnimatedPressable
            key="claim"
            onPress={onClaim}
            disabled={claiming}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl py-3"
            style={{ backgroundColor: color }}>
            {claiming ? <ActivityIndicator color="#FFFFFF" /> : <Sparkles size={16} color="#FFFFFF" />}
            <Text className="text-[15px] font-black text-white">Claim +{mission.reward} pts</Text>
          </AnimatedPressable>
        ) : null}
        {state === 'claimed' ? (
          <Text key="claimed" className="mt-2 text-right text-[11px] font-bold text-[#10B981]">
            {mission.category === 'milestone' ? 'Achieved' : 'Claimed · back next reset'}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// Fills from 0 to the current progress when it appears or changes.
function ProgressBar({ pct, color, isDark }: { pct: number; color: string; isDark: boolean }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.set(withTiming(Math.max(0, Math.min(1, pct)) * 100, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [pct, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.get()}%` }));

  return (
    <View className={`h-2.5 flex-1 overflow-hidden rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]'}`}>
      <Animated.View className="h-full rounded-full" style={[{ backgroundColor: color }, style]} />
    </View>
  );
}

// Soft breathing tint behind a card that's ready to claim.
function ReadyGlow({ color }: { color: string }) {
  const opacity = useSharedValue(0.05);

  useEffect(() => {
    opacity.set(
      withRepeat(
        withSequence(withTiming(0.16, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(0.05, { duration: 1100, easing: Easing.inOut(Easing.sin) })),
        -1
      )
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color }, style]} />;
}
