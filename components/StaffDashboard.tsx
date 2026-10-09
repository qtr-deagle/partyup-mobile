import { GuildSummaryCard } from '@/components/GuildSummaryCard';
import { riseIn } from '@/components/ui/motion';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { formatDateTime, formatTimeAgo } from '@/lib/datetime';
import type { LeaderGuildSnapshot, StaffOverview, StaffSosAlert } from '@/lib/homeDashboard';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import {
  BadgeCheck,
  CalendarDays,
  Car,
  ChevronRight,
  Flag,
  IdCard,
  Map as MapIcon,
  Route,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showAlert } from '@/lib/dialog';
type Props = {
  isDark: boolean;
  // Platform-wide numbers (admins only).
  overview: StaffOverview | null;
  // The leader's own guild (leaders only; null while loading or with no guild).
  guildSnapshot?: LeaderGuildSnapshot | null;
  // Verification queues are admin-only; Guild Leaders get guild shortcuts instead.
  isAdmin: boolean;
};

export default function StaffDashboard({ isDark, overview, guildSnapshot = null, isAdmin }: Props) {
  const router = useRouter();
  const { primaryColor, accentColor, destructiveColor, warningColor, panelBackground, panelBorder, mutedPanel, mutedText, primaryText, softBorder } =
    getTheme(isDark);

  const openSosOnMap = (alert: StaffSosAlert) =>
    router.push({
      pathname: '/(tabs)/map',
      params: {
        focus: alert.user_id,
        ...(alert.latitude != null && alert.longitude != null ? { lat: String(alert.latitude), lng: String(alert.longitude) } : {}),
      },
    });

  const showReportsInfo = () =>
    showAlert('User reports', 'Reports are handled by PartyUp admins on the admin website, where they can view evidence and resolve them.');

  const sosCount = overview?.active_sos.length ?? 0;
  const queueTotal = overview ? overview.pending_ids + overview.pending_vehicles + overview.open_reports : 0;
  const verifiedPercent = overview && overview.total_travelers > 0 ? Math.round((overview.verified_travelers / overview.total_travelers) * 100) : 0;

  return (
    <>
      {/* Live SOS (admins only; SOS is otherwise private to the trusted circle) */}
      {isAdmin ? (
      <Animated.View
        key={sosCount > 0 ? 'staff-sos-active' : 'staff-sos-clear'}
        entering={riseIn(80)}
        className={`rounded-[24px] border-2 p-4 ${
          sosCount > 0
            ? isDark
              ? 'border-[#7A2D2D] bg-[#251416]'
              : 'border-[#FFB1A9] bg-[#FFF3F1]'
            : isDark
              ? 'border-[#10B981] bg-[#0D1E1A]'
              : 'border-[#059669] bg-[#E5F6EF]'
        }`}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {sosCount > 0 ? <ShieldAlert size={20} color={destructiveColor} /> : <ShieldCheck size={20} color={accentColor} />}
            <Text className={`${typography.sectionTitle} ${primaryText}`}>Live SOS</Text>
          </View>
          <View
            className="rounded-full px-3 py-1"
            style={{
              backgroundColor: sosCount > 0 ? destructiveColor : accentColor,
            }}>
            <Text className="text-xs font-bold text-white">{overview ? (sosCount > 0 ? `${sosCount} active` : 'All clear') : '…'}</Text>
          </View>
        </View>

        {!overview ? (
          <View className="mt-4">
            <ActivityIndicator color={primaryColor} />
          </View>
        ) : sosCount === 0 ? (
          <Text className={`mt-3 text-base ${mutedText}`}>No travelers need help right now. New alerts will pop up on screen immediately.</Text>
        ) : (
          <View className="mt-4 gap-2">
            {overview.active_sos.map((alert) => (
              <AnimatedPressable
                key={alert.id}
                onPress={() => openSosOnMap(alert)}
                className={`flex-row items-center gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#422022]' : 'bg-white'}`}>
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: destructiveColor }} />
                <View className="flex-1">
                  <Text className={`text-base font-bold ${primaryText}`}>{alert.display_name}</Text>
                  <Text className={`mt-0.5 text-xs ${mutedText}`}>
                    {alert.trigger_reason === 'auto_escalation' ? 'Warning Mode escalated' : 'Manual SOS'} · {formatTimeAgo(alert.created_at)}
                  </Text>
                </View>
                <Text className="text-sm font-bold" style={{ color: destructiveColor }}>
                  Locate
                </Text>
                <ChevronRight size={16} color={destructiveColor} />
              </AnimatedPressable>
            ))}
          </View>
        )}
      </Animated.View>
      ) : null}

      {/* Guild, points and rank */}
      <GuildSummaryCard isDark={isDark} delay={110} />

      {/* Review queues (admins) */}
      {isAdmin ? (
      <Animated.View
        key="review-queues"
        entering={riseIn(140)}
        className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.sectionTitle} ${primaryText}`}>Review Queues</Text>
          <Text className={`text-sm font-semibold ${mutedText}`}>{overview ? `${queueTotal} waiting` : ''}</Text>
        </View>
        <View className="mt-4 gap-3">
          <QueueRow
            isDark={isDark}
            icon={<IdCard size={18} color={primaryColor} />}
            label="ID verifications"
            count={overview?.pending_ids}
            onPress={() => router.push('/id-review')}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
            highlight={warningColor}
          />
          <QueueRow
            isDark={isDark}
            icon={<Car size={18} color={primaryColor} />}
            label="Vehicle verifications"
            count={overview?.pending_vehicles}
            onPress={() => router.push('/vehicle-review')}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
            highlight={warningColor}
          />
          <QueueRow
            isDark={isDark}
            icon={<Flag size={18} color={primaryColor} />}
            label="Open user reports"
            count={overview?.open_reports}
            onPress={showReportsInfo}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
            highlight={destructiveColor}
          />
        </View>
      </Animated.View>
      ) : null}

      {/* Guild snapshot (leaders): their own guild's numbers and what's waiting on them */}
      {!isAdmin && guildSnapshot ? (
      <Animated.View
        key="guild-snapshot"
        entering={riseIn(170)}
        className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.sectionTitle} ${primaryText}`}>Guild Snapshot</Text>
          <Text numberOfLines={1} className={`ml-3 flex-shrink text-sm font-semibold ${mutedText}`}>
            {guildSnapshot.name}
          </Text>
        </View>
        <View className="mt-4 flex-row flex-wrap justify-between gap-y-3">
          <StatTile
            icon={<Users size={16} color={primaryColor} />}
            label="Members"
            value={guildSnapshot.member_cap ? `${guildSnapshot.member_count}/${guildSnapshot.member_cap}` : guildSnapshot.member_count}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<Target size={16} color={primaryColor} />}
            label="Points this month"
            value={guildSnapshot.points_this_month.toLocaleString()}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<Trophy size={16} color={warningColor} />}
            label="Guild rank this month"
            value={`#${guildSnapshot.month_rank} of ${guildSnapshot.guild_count}`}
            onPress={() => router.push({ pathname: '/guild', params: { tab: 'leaderboard' } })}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<CalendarDays size={16} color={accentColor} />}
            label="Upcoming PartyUps"
            value={guildSnapshot.upcoming_partyups}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
        </View>

        <View className="mt-3 gap-3">
          <QueueRow
            isDark={isDark}
            icon={<UserPlus size={18} color={primaryColor} />}
            label="Join requests"
            count={guildSnapshot.pending_join_requests}
            onPress={() => router.push({ pathname: '/guild/requests', params: { guildId: guildSnapshot.guild_id } })}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
            highlight={warningColor}
          />
          <QueueRow
            isDark={isDark}
            icon={<Flag size={18} color={primaryColor} />}
            label="Open guild reports"
            count={guildSnapshot.open_reports}
            onPress={() => router.push({ pathname: '/guild', params: { focus: 'reports' } })}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
            highlight={destructiveColor}
          />
        </View>

        {guildSnapshot.next_partyup_at ? (
          <View className={`mt-3 flex-row items-center gap-2 rounded-2xl p-4 ${mutedPanel}`}>
            <CalendarDays size={16} color={accentColor} />
            <Text numberOfLines={1} className={`flex-1 text-sm ${mutedText}`}>
              Next: <Text className={`font-semibold ${primaryText}`}>{guildSnapshot.next_partyup_title}</Text> · {formatDateTime(guildSnapshot.next_partyup_at)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      ) : null}

      {/* Platform snapshot (admins only; leaders see their guild above) */}
      {isAdmin ? (
      <Animated.View
        key="platform-snapshot"
        entering={riseIn(200)}
        className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
        <Text className={`${typography.sectionTitle} ${primaryText}`}>Platform Snapshot</Text>
        <View className="mt-4 flex-row flex-wrap justify-between gap-y-3">
          <StatTile
            icon={<Users size={16} color={primaryColor} />}
            label="Travelers"
            value={overview?.total_travelers}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<UserPlus size={16} color={primaryColor} />}
            label="Joined today"
            value={overview?.new_travelers_today}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<Route size={16} color={primaryColor} />}
            label="Open trips"
            value={overview?.open_trips}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
          <StatTile
            icon={<Route size={16} color={accentColor} />}
            label="Trips on the road"
            value={overview?.ongoing_trips}
            mutedPanel={mutedPanel}
            primaryText={primaryText}
            mutedText={mutedText}
          />
        </View>

        <View className={`mt-3 rounded-2xl p-4 ${mutedPanel}`}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <BadgeCheck size={16} color={accentColor} />
              <Text className={`text-sm ${mutedText}`}>ID-verified travelers</Text>
            </View>
            <Text className={`text-sm font-bold ${primaryText}`}>
              {overview ? `${overview.verified_travelers} of ${overview.total_travelers}` : '—'}
            </Text>
          </View>
          <View className="mt-3 flex-row items-center gap-3">
            <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#D9E4DE]">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${verifiedPercent}%`,
                  backgroundColor: accentColor,
                }}
              />
            </View>
            <Text className="text-base font-bold" style={{ color: accentColor }}>
              {verifiedPercent}%
            </Text>
          </View>
        </View>
      </Animated.View>
      ) : null}

      {/* Quick actions */}
      <Animated.View entering={riseIn(260)} className="flex-row flex-wrap justify-between gap-y-4">
        {isAdmin ? (
          <>
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<IdCard size={20} color={primaryColor} />}
          title="Review IDs"
          subtitle={overview ? `${overview.pending_ids} pending` : 'Approve or reject'}
          onPress={() => router.push('/id-review')}
          primaryText={primaryText}
          mutedText={mutedText}
        />
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<Car size={20} color={primaryColor} />}
          title="Review Vehicles"
          subtitle={overview ? `${overview.pending_vehicles} pending` : 'Driver documents'}
          onPress={() => router.push('/vehicle-review')}
          primaryText={primaryText}
          mutedText={mutedText}
        />
          </>
        ) : (
          <>
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<Shield size={20} color={primaryColor} />}
          title="My Guild"
          subtitle="Members & requests"
          onPress={() => router.push('/guild')}
          primaryText={primaryText}
          mutedText={mutedText}
        />
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<Target size={20} color={primaryColor} />}
          title="Missions"
          subtitle="Leader goals"
          onPress={() => router.push({ pathname: '/guild', params: { tab: 'missions' } })}
          primaryText={primaryText}
          mutedText={mutedText}
        />
          </>
        )}
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<MapIcon size={20} color={primaryColor} />}
          title="Live Map"
          subtitle="Monitor travelers"
          onPress={() => router.push('/(tabs)/map')}
          primaryText={primaryText}
          mutedText={mutedText}
        />
        <ActionTile
          isDark={isDark}
          softBorder={softBorder}
          icon={<Settings size={20} color={primaryColor} />}
          title="Settings"
          subtitle="Account & safety"
          onPress={() => router.push('/modal')}
          primaryText={primaryText}
          mutedText={mutedText}
        />
      </Animated.View>
    </>
  );
}

function QueueRow({
  isDark,
  icon,
  label,
  count,
  onPress,
  mutedPanel,
  primaryText,
  mutedText,
  highlight,
}: {
  isDark: boolean;
  icon: ReactNode;
  label: string;
  count: number | undefined;
  onPress: () => void;
  mutedPanel: string;
  primaryText: string;
  mutedText: string;
  highlight: string;
}) {
  const hasItems = (count ?? 0) > 0;
  return (
    <AnimatedPressable onPress={onPress} className={`flex-row items-center gap-3 rounded-2xl p-4 ${mutedPanel}`}>
      <View className={`h-9 w-9 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>{icon}</View>
      <Text className={`flex-1 text-base font-semibold ${primaryText}`}>{label}</Text>
      <View
        className="min-w-[32px] items-center rounded-full px-2.5 py-1"
        style={{
          backgroundColor: hasItems ? highlight : isDark ? '#22324B' : '#E2E8F0',
        }}>
        <Text className={`text-sm font-bold ${hasItems ? 'text-white' : mutedText}`}>{count ?? '—'}</Text>
      </View>
      <ChevronRight size={16} color={isDark ? '#94A3B8' : '#64748B'} />
    </AnimatedPressable>
  );
}

function StatTile({
  icon,
  label,
  value,
  onPress,
  mutedPanel,
  primaryText,
  mutedText,
}: {
  icon: ReactNode;
  label: string;
  value: number | string | undefined;
  onPress?: () => void;
  mutedPanel: string;
  primaryText: string;
  mutedText: string;
}) {
  const content = (
    <>
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text className={`text-xs ${mutedText}`}>{label}</Text>
      </View>
      <Text className={`mt-2 ${typography.valueLarge} ${primaryText}`}>{value ?? '—'}</Text>
    </>
  );
  return onPress ? (
    <AnimatedPressable onPress={onPress} className={`w-[48%] rounded-2xl p-4 ${mutedPanel}`}>
      {content}
    </AnimatedPressable>
  ) : (
    <View className={`w-[48%] rounded-2xl p-4 ${mutedPanel}`}>{content}</View>
  );
}

function ActionTile({
  isDark,
  softBorder,
  icon,
  title,
  subtitle,
  onPress,
  primaryText,
  mutedText,
}: {
  isDark: boolean;
  softBorder: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  primaryText: string;
  mutedText: string;
}) {
  return (
    <AnimatedPressable onPress={onPress} className={`w-[48%] rounded-[22px] border px-4 py-4 ${softBorder} ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
      <View className={`h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>{icon}</View>
      <Text className={`mt-3 text-base font-bold ${primaryText}`}>{title}</Text>
      <Text className={`mt-1 text-xs ${mutedText}`}>{subtitle}</Text>
    </AnimatedPressable>
  );
}
