import { GuildEmblem } from "@/components/GuildEmblem";
import {
  GuildFormModal,
  type GuildFormValues,
} from "@/components/GuildFormModal";
import { GuildAnnouncement } from "@/components/guild/GuildAnnouncement";
import { GuildPerksModal } from "@/components/guild/GuildPerksModal";
import { RankMedal } from "@/components/guild/RankMedal";
import {
  MEDALS,
  PERIODS,
  Segmented,
} from "@/components/guild/LeaderboardPanel";
import { SeasonMedal } from "@/components/guild/TrophyMedals";
import { UserRankTag } from "@/components/guild/UserRankTag";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { riseIn, SkeletonRow } from "@/components/ui/motion";
import { Card } from "@/components/ui/screen-header";
import { useAuth } from "@/hooks/auth-provider";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useGuildJoin } from "@/hooks/use-guild-join";
import {
  getGuild,
  getGuildLeaderboard,
  getGuildMemberBoard,
  getGuildSeasonAwards,
  activeGuildPerks,
  getPointsSummary,
  GUILD_FOCUS_OPTIONS,
  formatGuildAreas,
  GUILD_LEVEL_STEP,
  GUILD_MAX_MEMBERS,
  guildLevel,
  guildMemberCap,
  nextCapLevel,
  nextGuildPerk,
  inGuildAreas,
  meetsMinRank,
  seasonLabel,
  titleFor,
  updateGuild,
  type Guild,
  type GuildMemberStanding,
  type GuildStanding,
  type LeaderboardPeriod,
  type SeasonAward,
} from "@/lib/guilds";
import { getTheme, typography } from "@/lib/theme";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Gift,
  Crown,
  DoorOpen,
  Info,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  Swords,
  Trophy,
  Users,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Guild Hall: a game-style page for one guild -- banner, level bar, standing,
// season medals, and the ranked roster. Opened from the Leaderboard and from
// My Guild.
export default function GuildHallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const { profile } = useAuth();
  const { screenBackground, primaryColor, primaryText, mutedText, mutedPanel } =
    getTheme(isDark);

  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [perksVisible, setPerksVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [standing, setStanding] = useState<GuildStanding | null>(null);
  const [place, setPlace] = useState<number | null>(null);
  const [guildCount, setGuildCount] = useState(0);
  const [members, setMembers] = useState<GuildMemberStanding[]>([]);
  const [medals, setMedals] = useState<SeasonAward[]>([]);
  const [myGuildId, setMyGuildId] = useState<string | null>(null);
  const [myPoints, setMyPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isTraveler = profile?.role === "traveler";
  const join = useGuildJoin({
    onJoined: () =>
      router.replace({ pathname: "/guild", params: { tab: "mine" } }),
  });
  const { refreshMyRequest } = join;

  const load = useCallback(
    async (nextPeriod: LeaderboardPeriod) => {
      if (!id) return;
      const [
        guildResult,
        boardResult,
        membersResult,
        medalsResult,
        summaryResult,
      ] = await Promise.all([
        getGuild(id),
        getGuildLeaderboard(nextPeriod),
        getGuildMemberBoard(id, nextPeriod),
        getGuildSeasonAwards(id),
        getPointsSummary(),
      ]);
      setErrorMessage(
        guildResult.error?.message ??
          (guildResult.data ? null : "Guild not found."),
      );
      setGuild(guildResult.data);
      const index = boardResult.data.findIndex((row) => row.guild_id === id);
      setStanding(index >= 0 ? boardResult.data[index] : null);
      setPlace(index >= 0 ? index + 1 : null);
      setGuildCount(boardResult.data.length);
      setMembers(membersResult.data);
      setMedals(medalsResult.data);
      setMyGuildId(summaryResult.data?.guild_id ?? null);
      setMyPoints(summaryResult.data?.lifetime_points ?? 0);
      if (isTraveler && !summaryResult.data?.guild_id) await refreshMyRequest();
      setLoading(false);
    },
    [id, isTraveler, refreshMyRequest],
  );

  useFocusEffect(
    useCallback(() => {
      void load(period);
    }, [load, period]),
  );

  const color = guild?.color ?? primaryColor;
  const lifetime = standing?.lifetime_points ?? 0;
  const level = guildLevel(lifetime);
  const levelProgress = (lifetime % GUILD_LEVEL_STEP) / GUILD_LEVEL_STEP;
  const periodLabel =
    PERIODS.find((option) => option.id === period)?.label.toLowerCase() ?? "";
  const leader = members.find((member) => member.is_leader) ?? null;
  const ranked = members.map((member, index) => ({ member, place: index + 1 }));
  const roster = [
    ...ranked.filter((row) => row.member.is_leader),
    ...ranked.filter((row) => !row.member.is_leader),
  ];
  const periodTotal = members.reduce((sum, member) => sum + member.points, 0);
  const mvp = members[0] && members[0].points > 0 ? members[0].user_id : null;
  const isMine = myGuildId === id;
  const canManage = !!guild && guild.leader_id === profile?.id;
  const canJoin = isTraveler && !myGuildId && !!guild;
  const requested = join.myRequest?.guild_id === id;
  const memberCount = standing?.member_count ?? members.length;
  const cap = guildMemberCap(lifetime);
  const unlockLevel = nextCapLevel(level);
  const nextCap = guildMemberCap((unlockLevel - 1) * GUILD_LEVEL_STEP);
  const isFull = memberCount >= cap;
  const rankTooLow = !!guild && !meetsMinRank(myPoints, guild.min_rank);
  const outsideAreas = !!guild && !inGuildAreas(profile?.city, guild.areas);
  const focusLabels = (guild?.focus ?? []).map(
    (item) =>
      GUILD_FOCUS_OPTIONS.find((option) => option.id === item)?.label ?? item,
  );

  function openEdit() {
    setEditError(null);
    setEditVisible(true);
  }

  async function submitEdit(values: GuildFormValues) {
    if (!guild) return;
    setEditBusy(true);
    setEditError(null);
    const { error } = await updateGuild(guild.id, values);
    setEditBusy(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    setEditVisible(false);
    await load(period);
  }

  function openPlayer(member: GuildMemberStanding) {
    router.push({
      pathname: "/profile/[id]",
      params: { id: member.user_id, displayName: member.display_name },
    });
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Banner */}
        <View
          className="overflow-hidden"
          style={{
            backgroundColor: color,
            paddingTop: insets.top + 10,
            paddingBottom: 56,
          }}
        >
          <View className="absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10" />
          <View className="absolute -left-20 top-24 h-48 w-48 rounded-full bg-black/10" />
          <View className="flex-row items-center justify-between px-4">
            <AnimatedPressable
              onPress={() => router.back()}
              scaleTo={0.9}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/20"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={21} color="#FFFFFF" />
            </AnimatedPressable>
            {canManage ? (
              <AnimatedPressable
                onPress={openEdit}
                scaleTo={0.9}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/20"
                accessibilityLabel="Edit guild"
              >
                <Pencil size={18} color="#FFFFFF" />
              </AnimatedPressable>
            ) : null}
          </View>

          {guild ? (
            <Animated.View
              key="banner"
              entering={riseIn(0, 450)}
              className="mt-2 items-center px-6"
            >
              <View className="items-center justify-center rounded-full bg-white/20 p-2.5">
                <View className="rounded-full border-4 border-white/70">
                  <GuildEmblem emblem={guild.emblem} color={color} size={92} />
                </View>
              </View>
              <Text className="mt-3 text-center text-[26px] font-black text-white">
                {guild.name}
              </Text>
              {guild.tagline ? (
                <Text className="mt-0.5 text-center text-sm text-white/85">
                  {guild.tagline}
                </Text>
              ) : null}
              <View className="mt-3 flex-row flex-wrap justify-center gap-2">
                {place ? (
                  <View className="flex-row items-center gap-1 rounded-full bg-white px-3 py-1">
                    <Trophy
                      size={13}
                      color={place <= 3 ? MEDALS[place - 1] : color}
                    />
                    <Text
                      className="text-xs font-black"
                      style={{ color: place <= 3 ? MEDALS[place - 1] : color }}
                    >
                      #{place} of {guildCount} {periodLabel}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                  {guild.join_policy === "approval" ? (
                    <Lock size={12} color="#FFFFFF" />
                  ) : (
                    <DoorOpen size={12} color="#FFFFFF" />
                  )}
                  <Text className="text-xs font-bold text-white">
                    {guild.join_policy === "approval"
                      ? "Approval required"
                      : "Open to all"}
                  </Text>
                </View>
                {guild.min_rank ? (
                  <View className="flex-row items-center gap-1 rounded-full bg-white/20 py-0.5 pl-1 pr-3">
                    <RankMedal rank={guild.min_rank} size={18} />
                    <Text className="text-xs font-bold text-white">
                      {guild.min_rank}+ only
                    </Text>
                  </View>
                ) : null}
                {guild.areas.length > 0 ? (
                  <View className="flex-row items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                    <MapPin size={12} color="#FFFFFF" />
                    <Text className="text-xs font-bold text-white">
                      {formatGuildAreas(guild.areas)}
                    </Text>
                  </View>
                ) : null}
                {isMine ? (
                  <View className="rounded-full bg-white/20 px-3 py-1">
                    <Text className="text-xs font-bold text-white">
                      Your guild
                    </Text>
                  </View>
                ) : null}
              </View>
              {isMine ? (
                <AnimatedPressable
                  onPress={() => router.push("/guild/chat")}
                  className="mt-4 flex-row items-center gap-2 rounded-full bg-white px-5 py-2.5"
                  accessibilityLabel="Open guild chat"
                >
                  <MessageCircle size={16} color={color} />
                  <Text className="text-sm font-black" style={{ color }}>
                    Guild chat
                  </Text>
                </AnimatedPressable>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        <View className="-mt-10 gap-4 px-4">
          {errorMessage ? (
            <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          {loading ? (
            <Card key="loading">
              {[0, 1, 2].map((index) => (
                <SkeletonRow key={index} />
              ))}
            </Card>
          ) : guild ? (
            <View key="content" className="gap-4">
              {/* Pinned announcement. getGuild() only returns it to members (and admins). */}
              {isMine || guild.announcement ? (
                <GuildAnnouncement
                  key="announcement"
                  guild={guild}
                  isDark={isDark}
                  canEdit={canManage}
                  onSaved={() => void load(period)}
                />
              ) : null}

              {/* Level + stats */}
              <Card index={0}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: color }}
                    >
                      <Text className="text-base font-black text-white">
                        {level}
                      </Text>
                    </View>
                    <View>
                      <Text
                        className={`text-xs font-bold uppercase tracking-wide ${mutedText}`}
                      >
                        Guild level
                      </Text>
                      <Text className={`text-base font-black ${primaryText}`}>
                        Level {level}
                      </Text>
                    </View>
                  </View>
                  <Text className={`text-xs font-bold ${mutedText}`}>
                    {lifetime % GUILD_LEVEL_STEP} / {GUILD_LEVEL_STEP} XP
                  </Text>
                </View>
                <View
                  className={`mt-3 h-3 overflow-hidden rounded-full ${isDark ? "bg-[#22324B]" : "bg-[#E2E8F0]"}`}
                >
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, Math.round(levelProgress * 100))}%`,
                      backgroundColor: color,
                    }}
                  />
                </View>
                <Text className={`mt-1.5 text-xs ${mutedText}`}>
                  {GUILD_LEVEL_STEP - (lifetime % GUILD_LEVEL_STEP)} XP to Level{" "}
                  {level + 1}
                </Text>

                <AnimatedPressable
                  onPress={() => setPerksVisible(true)}
                  scaleTo={0.98}
                  className={`mt-3 rounded-2xl px-3 py-2.5 ${isDark ? "bg-[#18253C]" : "bg-[#F3F4F8]"}`}
                  accessibilityLabel="View guild perks"
                >
                  <View className="flex-row items-center gap-2">
                    <Gift size={15} color={color} />
                    <Text className={`flex-1 text-sm font-bold ${primaryText}`}>
                      Guild Perks
                    </Text>
                    <ChevronRight size={16} color={isDark ? "#94A3B8" : "#64748B"} />
                  </View>
                  <Text className={`mt-1 text-xs ${mutedText}`}>
                    {activeGuildPerks(level)
                      .map((perk) => perk.label)
                      .join(" · ")}
                  </Text>
                  {nextGuildPerk(level) ? (
                    <Text className="mt-0.5 text-xs font-bold" style={{ color }}>
                      Next: Level {nextGuildPerk(level)?.level} ·{" "}
                      {nextGuildPerk(level)?.label}
                    </Text>
                  ) : null}
                </AnimatedPressable>

                <View className="mt-4 flex-row gap-2">
                  <StatTile
                    label={`of ${cap} members`}
                    value={memberCount}
                    isDark={isDark}
                  />
                  <StatTile
                    label={
                      period === "all"
                        ? "All time"
                        : period === "month"
                          ? "This month"
                          : "This week"
                    }
                    value={standing?.points ?? 0}
                    isDark={isDark}
                    accent={color}
                  />
                  <StatTile label="Lifetime" value={lifetime} isDark={isDark} />
                </View>

                {canJoin ? (
                  requested ? (
                    <AnimatedPressable
                      key="requested"
                      onPress={join.cancelRequest}
                      disabled={join.joiningId === "cancel"}
                      className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl border py-3.5 ${isDark ? "border-[#334155]" : "border-[#CBD5E1]"}`}
                    >
                      {join.joiningId === "cancel" ? (
                        <ActivityIndicator color={color} />
                      ) : (
                        <Clock size={16} color={color} />
                      )}
                      <Text className="font-bold" style={{ color }}>
                        Requested · tap to cancel
                      </Text>
                    </AnimatedPressable>
                  ) : rankTooLow || outsideAreas || isFull ? (
                    <View
                      key="blocked"
                      className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${isDark ? "bg-[#22324B]" : "bg-[#E2E8F0]"}`}
                    >
                      {rankTooLow && guild.min_rank ? (
                        <RankMedal rank={guild.min_rank} size={20} locked />
                      ) : outsideAreas ? (
                        <MapPin
                          size={17}
                          color={isDark ? "#94A3B8" : "#64748B"}
                        />
                      ) : (
                        <Users
                          size={17}
                          color={isDark ? "#94A3B8" : "#64748B"}
                        />
                      )}
                      <Text className={`text-base font-black ${mutedText}`}>
                        {rankTooLow
                          ? `Reach ${guild.min_rank} rank to join`
                          : outsideAreas
                            ? `For members from ${formatGuildAreas(guild.areas)}`
                            : "This guild is full"}
                      </Text>
                    </View>
                  ) : (
                    <AnimatedPressable
                      key="join"
                      onPress={() =>
                        join.requestJoin({
                          guild_id: guild.id,
                          name: guild.name,
                          emblem: guild.emblem,
                          color: guild.color,
                          leader_name:
                            leader?.display_name ??
                            standing?.leader_name ??
                            "The leader",
                          join_policy: guild.join_policy,
                        })
                      }
                      disabled={join.joiningId === guild.id}
                      className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
                      style={{ backgroundColor: color }}
                    >
                      {join.joiningId === guild.id ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Swords size={17} color="#FFFFFF" />
                      )}
                      <Text className="text-base font-black text-white">
                        {guild.join_policy === "approval"
                          ? "Request to join"
                          : "Join this guild"}
                      </Text>
                    </AnimatedPressable>
                  )
                ) : null}
              </Card>

              {/* About (always shown: the joining rules apply to every guild) */}
              <Card key="about" index={1}>
                <View className="flex-row items-center gap-2">
                  <Info size={18} color={color} />
                  <Text className={`${typography.sectionTitle} ${primaryText}`}>
                    About
                  </Text>
                </View>
                {guild.description ? (
                  <Text className={`mt-2 text-sm leading-5 ${primaryText}`}>
                    {guild.description}
                  </Text>
                ) : null}
                {focusLabels.length > 0 ? (
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {focusLabels.map((label) => (
                      <View
                        key={label}
                        className="rounded-full px-3 py-1"
                        style={{ backgroundColor: `${color}1F` }}
                      >
                        <Text className="text-xs font-bold" style={{ color }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View className={`mt-3 gap-2 rounded-2xl p-3 ${mutedPanel}`}>
                  <Text
                    className={`text-xs font-black uppercase tracking-wide ${mutedText}`}
                  >
                    Joining rules
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {guild.join_policy === "approval" ? (
                      <Lock size={15} color={color} />
                    ) : (
                      <DoorOpen size={15} color={color} />
                    )}
                    <Text className={`text-sm ${primaryText}`}>
                      {guild.join_policy === "approval"
                        ? "Leader approves each request"
                        : "Anyone eligible joins instantly"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {guild.min_rank ? (
                      <RankMedal rank={guild.min_rank} size={16} />
                    ) : (
                      <Users size={15} color={color} />
                    )}
                    <Text className={`text-sm ${primaryText}`}>
                      {guild.min_rank
                        ? `${guild.min_rank} rank and up`
                        : "Any rank welcome"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <MapPin size={15} color={color} />
                    <Text className={`flex-1 text-sm ${primaryText}`}>
                      {guild.areas.length > 0
                        ? `Members from ${guild.areas.join(", ")}`
                        : "Members from all of Bulacan"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Users size={15} color={color} />
                    <Text className={`text-sm ${primaryText}`}>
                      {memberCount} / {cap} members{isFull ? " (full)" : ""}
                      {cap < GUILD_MAX_MEMBERS
                        ? ` · Level ${unlockLevel} unlocks ${nextCap}`
                        : ""}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Season medals */}
              {medals.length > 0 ? (
                <Card key="medals" index={1}>
                  <View className="flex-row items-center gap-2">
                    <Trophy size={18} color={MEDALS[0]} />
                    <Text
                      className={`${typography.sectionTitle} ${primaryText}`}
                    >
                      Trophy Wall
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-3"
                    contentContainerClassName="gap-3"
                  >
                    {medals.map((award) => (
                      <View
                        key={award.id}
                        className={`w-[96px] items-center rounded-2xl p-2.5 ${mutedPanel}`}
                      >
                        <SeasonMedal
                          place={award.place}
                          board="guild"
                          size={50}
                        />
                        <Text
                          className={`mt-1 text-xs font-black ${primaryText}`}
                        >
                          {seasonLabel(award.season)}
                        </Text>
                        <Text className={`text-[10px] ${mutedText}`}>
                          {["1st", "2nd", "3rd"][award.place - 1]} ·{" "}
                          {award.points} pts
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </Card>
              ) : null}

              {/* Roster */}
              <Card index={2}>
                <View className="flex-row items-center gap-2">
                  <Users size={18} color={color} />
                  <Text className={`${typography.sectionTitle} ${primaryText}`}>
                    Roster
                  </Text>
                  <Text className={`text-sm ${mutedText}`}>
                    · {members.length}
                  </Text>
                </View>
                <View className="mt-3">
                  <Segmented
                    isDark={isDark}
                    options={PERIODS}
                    value={period}
                    onChange={(value) => setPeriod(value as LeaderboardPeriod)}
                    small
                  />
                </View>
                <View className="mt-3 gap-2">
                  {roster.map(({ member, place: memberPlace }) => {
                    const share =
                      periodTotal > 0 ? member.points / periodTotal : 0;
                    const isMvp = member.user_id === mvp;
                    return (
                      <AnimatedPressable
                        key={member.user_id}
                        onPress={() => openPlayer(member)}
                        scaleTo={0.98}
                        accessibilityLabel={`Open ${member.display_name}'s player card`}
                        className={`rounded-2xl p-3 ${mutedPanel}`}
                        style={
                          member.is_leader
                            ? { borderWidth: 2, borderColor: color }
                            : undefined
                        }
                      >
                        <View className="flex-row items-center gap-3">
                          <Text
                            className={`w-6 text-center text-sm font-black ${memberPlace <= 3 ? "" : mutedText}`}
                            style={
                              memberPlace <= 3
                                ? { color: MEDALS[memberPlace - 1] }
                                : undefined
                            }
                          >
                            {memberPlace}
                          </Text>
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-[#B7C4EC]">
                            <Text className="text-base font-bold text-[#24314A]">
                              {member.display_name.charAt(0).toUpperCase()}
                            </Text>
                            <UserRankTag
                              userId={member.user_id}
                              isDark={isDark}
                              variant="overlay"
                              points={member.lifetime_points}
                              size={20}
                            />
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center gap-1.5">
                              <Text
                                className={`shrink text-base font-bold ${primaryText}`}
                                numberOfLines={1}
                              >
                                {member.display_name}
                                {member.user_id === profile?.id ? " (you)" : ""}
                              </Text>
                              {member.is_leader ? (
                                <Crown size={14} color={color} />
                              ) : null}
                              {isMvp ? (
                                <View
                                  className="rounded-full px-1.5 py-0.5"
                                  style={{ backgroundColor: MEDALS[0] }}
                                >
                                  <Text className="text-[9px] font-black text-white">
                                    MVP
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            <Text
                              className={`text-xs ${mutedText}`}
                              numberOfLines={1}
                            >
                              {titleFor(
                                member.lifetime_points,
                                member.is_leader ? "guild_leader" : "traveler",
                              )}
                            </Text>
                          </View>
                          <View className="items-end">
                            <Text
                              className={`text-base font-black ${primaryText}`}
                            >
                              {member.points}
                            </Text>
                            <Text className={`text-[10px] ${mutedText}`}>
                              pts
                            </Text>
                          </View>
                          <ChevronRight
                            size={16}
                            color={isDark ? "#64748B" : "#94A3B8"}
                          />
                        </View>
                        <View
                          className={`ml-9 mt-2 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-[#22324B]" : "bg-[#E2E8F0]"}`}
                        >
                          <View
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(share * 100)}%`,
                              backgroundColor: color,
                            }}
                          />
                        </View>
                      </AnimatedPressable>
                    );
                  })}
                </View>
                {periodTotal === 0 ? (
                  <Text className={`mt-3 text-center text-xs ${mutedText}`}>
                    No points {periodLabel} yet. The next trip starts the race.
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {join.overlay}
      <GuildPerksModal
        visible={perksVisible}
        isDark={isDark}
        level={level}
        onClose={() => setPerksVisible(false)}
      />

      <GuildFormModal
        visible={editVisible}
        isDark={isDark}
        guild={guild}
        busy={editBusy}
        errorMessage={editError}
        onClose={() => setEditVisible(false)}
        onSubmit={(values) => void submitEdit(values)}
      />
    </View>
  );
}

function StatTile({
  label,
  value,
  isDark,
  accent,
}: {
  label: string;
  value: number;
  isDark: boolean;
  accent?: string;
}) {
  return (
    <View
      className={`flex-1 items-center rounded-2xl py-3 ${isDark ? "bg-[#18253C]" : "bg-[#F3F6FB]"}`}
    >
      <Text
        className="text-xl font-black"
        style={{ color: accent ?? (isDark ? "#FFFFFF" : "#182847") }}
      >
        {value}
      </Text>
      <Text
        className={`mt-0.5 text-[11px] font-semibold ${isDark ? "text-[#94A3B8]" : "text-[#67748D]"}`}
      >
        {label}
      </Text>
    </View>
  );
}
