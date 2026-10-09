import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { Card } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { parseTimestamp } from '@/lib/datetime';
import {
  cancelGuildPartyup,
  joinGuildPartyup,
  leaveGuildPartyup,
  listGuildPartyups,
  type GuildPartyup,
} from '@/lib/guilds';
import { feedback } from '@/lib/sounds';
import { getTheme, typography } from '@/lib/theme';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Check, Clock, MapPin, Navigation, PartyPopper, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
type Props = {
  guildId: string;
  guildName: string;
  color: string;
  isDark: boolean;
  // The guild leader can start and cancel PartyUps.
  canCreate: boolean;
  index?: number;
};

function formatWhen(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 1).toUpperCase();
}

// "Let's PartyUp!": a hangout the guild leader posts for guild mates only
// (not a carpool or tour). Members see the pinned spot and time, and tap
// "I'm going" to show up in the going list.
export function GuildPartyups({ guildId, guildName, color, isDark, canCreate, index }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const myId = profile?.id;
  const { primaryText, mutedText, mutedPanel } = getTheme(isDark);
  const [partyups, setPartyups] = useState<GuildPartyup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await listGuildPartyups(guildId);
    setPartyups(data);
    setLoading(false);
  }, [guildId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function run(partyupId: string, action: () => Promise<{ error: { message: string } | null }>, failTitle: string) {
    setBusyId(partyupId);
    const { error } = await action();
    if (error) {
      setBusyId(null);
      feedback.error();
      showAlert(failTitle, error.message);
      return;
    }
    feedback.success();
    await load();
    setBusyId(null);
  }

  function toggleGoing(partyup: GuildPartyup) {
    if (!partyup.i_am_going) {
      void run(partyup.id, () => joinGuildPartyup(partyup.id), 'Unable to join');
      return;
    }
    showAlert('Not going anymore?', `You'll be taken off the going list for "${partyup.title}".`, [
      { text: 'Stay', style: 'cancel' },
      { text: "I can't go", style: 'destructive', onPress: () => void run(partyup.id, () => leaveGuildPartyup(partyup.id), 'Unable to leave') },
    ]);
  }

  function confirmCancel(partyup: GuildPartyup) {
    showAlert('Cancel this PartyUp?', `Everyone going to "${partyup.title}" will be notified.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel PartyUp', style: 'destructive', onPress: () => void run(partyup.id, () => cancelGuildPartyup(partyup.id), 'Unable to cancel') },
    ]);
  }

  function openMap(partyup: GuildPartyup) {
    const query =
      partyup.place_lat != null && partyup.place_lng != null
        ? `${partyup.place_lat},${partyup.place_lng}`
        : encodeURIComponent([partyup.place_label, partyup.place_municipality].filter(Boolean).join(', '));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  return (
    <Card index={index}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <PartyPopper size={18} color={color} />
          <Text className={`${typography.sectionTitle} ${primaryText}`}>Guild PartyUps</Text>
        </View>
        {canCreate ? (
          <AnimatedPressable
            onPress={() => router.push({ pathname: '/guild/partyup', params: { guildId, guildName } })}
            className="rounded-full bg-[#2A55D4] px-4 py-2">
            <Text className="text-sm font-black text-white">Let&apos;s PartyUp!</Text>
          </AnimatedPressable>
        ) : null}
      </View>

      {loading ? (
        <View className="py-4">
          <ActivityIndicator color={color} />
        </View>
      ) : partyups.length === 0 ? (
        <Text className={`mt-3 text-sm ${mutedText}`}>
          {canCreate
            ? 'Plan a hangout just for your guild mates. Pin where to meet and everyone gets notified.'
            : 'No PartyUps yet. When your guild leader plans one, it shows up here.'}
        </Text>
      ) : (
        <View className="mt-3 gap-2">
          {partyups.map((partyup) => {
            const busy = busyId === partyup.id;
            const expanded = expandedId === partyup.id;
            const shown = partyup.going.slice(0, 5);
            const mine = canCreate && partyup.created_by === myId;
            const filled = partyup.i_am_going && !mine;
            return (
              <AnimatedPressable
                key={partyup.id}
                onPress={() => setExpandedId(expanded ? null : partyup.id)}
                className={`rounded-2xl p-3 ${mutedPanel}`}>
                <Text className={`text-base font-bold ${primaryText}`} numberOfLines={expanded ? undefined : 1}>
                  {partyup.title}
                </Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Clock size={13} color={color} />
                  <Text className={`flex-1 text-xs ${mutedText}`}>{formatWhen(partyup.meet_at)}</Text>
                </View>
                <AnimatedPressable onPress={() => openMap(partyup)} className="mt-1 flex-row items-center gap-1.5 self-start">
                  <MapPin size={13} color={color} />
                  <Text className="text-xs font-semibold" style={{ color }} numberOfLines={expanded ? undefined : 1}>
                    {partyup.place_label}
                    {partyup.place_municipality ? `, ${partyup.place_municipality}` : ''}
                  </Text>
                  <Navigation size={11} color={color} />
                </AnimatedPressable>

                {expanded && partyup.notes ? <Text className={`mt-2 text-sm leading-5 ${primaryText}`}>{partyup.notes}</Text> : null}

                <View className="mt-2.5 flex-row items-center gap-2">
                  <View className="flex-1 flex-row items-center">
                    {shown.map((goer, i) => (
                      <View
                        key={goer.user_id}
                        className="h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2"
                        style={{ marginLeft: i === 0 ? 0 : -8, borderColor: isDark ? '#18253C' : '#FFFFFF', backgroundColor: `${color}33` }}>
                        {goer.avatar_url ? (
                          <Image source={{ uri: goer.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Text className="text-[11px] font-black" style={{ color }}>
                            {initials(goer.display_name)}
                          </Text>
                        )}
                      </View>
                    ))}
                    <Text className={`ml-2 text-xs ${mutedText}`}>{partyup.going_count} going</Text>
                  </View>

                  {/* The leader is always going to their own PartyUp, so their button cancels it. */}
                  <AnimatedPressable
                    onPress={() => (mine ? confirmCancel(partyup) : toggleGoing(partyup))}
                    disabled={busy}
                    className="flex-row items-center gap-1 rounded-xl border px-3 py-2"
                    style={filled ? { borderColor: color, backgroundColor: color } : { borderColor: color }}>
                    {busy ? (
                      <ActivityIndicator color={filled ? '#FFFFFF' : color} />
                    ) : mine ? (
                      <Text className="text-xs font-bold" style={{ color }}>
                        Cancel
                      </Text>
                    ) : partyup.i_am_going ? (
                      <>
                        <Check size={13} color="#FFFFFF" />
                        <Text className="text-xs font-bold text-white">Going</Text>
                      </>
                    ) : (
                      <Text className="text-xs font-bold" style={{ color }}>
                        I&apos;m going
                      </Text>
                    )}
                  </AnimatedPressable>
                </View>

                {expanded ? (
                  <View className="mt-3 gap-1.5">
                    <View className="flex-row items-center gap-1.5">
                      <Users size={13} color={color} />
                      <Text className={`text-xs font-bold uppercase tracking-[1px] ${mutedText}`}>Who&apos;s going</Text>
                    </View>
                    {partyup.going.map((goer) => (
                      <Text key={goer.user_id} className={`text-sm ${primaryText}`}>
                        {goer.display_name ?? 'Guild mate'}
                        {goer.user_id === partyup.created_by ? ' · leader' : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </AnimatedPressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
