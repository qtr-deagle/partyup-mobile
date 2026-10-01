import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn, SuccessOverlay } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import {
  applyForGuildLeader,
  getLeaderEligibility,
  getMyLeaderApplication,
  GUILD_NAME_IDEAS,
  LEADER_REQUIREMENTS,
  type LeaderApplication,
  type LeaderEligibility,
} from '@/lib/guilds';
import { useFocusEffect } from 'expo-router';
import { BadgeCheck, Check, Clock, Crown, Flag, MapPinned, Star, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

// The top of the traveler ladder: meet the bar (completed trips, hosted
// trips, an established 4+ rating, verified ID) and apply to found your own
// guild. Admins approve on the website.
export function BecomeLeaderCard({ isDark, index = 0 }: { isDark: boolean; index?: number }) {
  const { refreshProfile } = useAuth();
  const [eligibility, setEligibility] = useState<LeaderEligibility | null>(null);
  const [application, setApplication] = useState<LeaderApplication | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [pitch, setPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const clearSent = useCallback(() => setSent(false), []);

  const load = useCallback(async () => {
    const [eligibilityResult, applicationResult] = await Promise.all([getLeaderEligibility(), getMyLeaderApplication()]);
    setEligibility(eligibilityResult.data);
    setApplication(applicationResult.data);
    // Approved while the app was open: pick up the new Guild Leader role.
    if (applicationResult.data?.status === 'approved') void refreshProfile();
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function submit() {
    setBusy(true);
    setFormError(null);
    const { error } = await applyForGuildLeader(guildName.trim(), pitch.trim());
    setBusy(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setFormVisible(false);
    setSent(true);
    await load();
  }

  if (!eligibility) return null;

  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const input = isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]';
  const chip = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#DCE3EF] bg-[#F4F6FA]';
  const muted = isDark ? '#64748B' : '#94A3B8';
  const pending = application?.status === 'pending';
  const declined = application?.status === 'declined';
  const canSubmit = guildName.trim().length >= 3 && pitch.trim().length >= 10 && !busy;

  const requirements = [
    {
      key: 'trips',
      met: eligibility.trips_ok,
      icon: <MapPinned size={22} color={eligibility.trips_ok ? '#10B981' : muted} />,
      label: `Complete ${LEADER_REQUIREMENTS.trips} trips`,
      detail: `${Math.min(eligibility.trips_completed, LEADER_REQUIREMENTS.trips)} / ${LEADER_REQUIREMENTS.trips} trips`,
      progress: eligibility.trips_completed / LEADER_REQUIREMENTS.trips,
    },
    {
      key: 'hosted',
      met: eligibility.hosted_ok,
      icon: <Flag size={22} color={eligibility.hosted_ok ? '#10B981' : muted} />,
      label: `Host ${LEADER_REQUIREMENTS.hosted} trips`,
      detail: `${Math.min(eligibility.trips_hosted, LEADER_REQUIREMENTS.hosted)} / ${LEADER_REQUIREMENTS.hosted} completed trips you organized`,
      progress: eligibility.trips_hosted / LEADER_REQUIREMENTS.hosted,
    },
    {
      key: 'verified',
      met: eligibility.verified,
      icon: <BadgeCheck size={22} color={eligibility.verified ? '#10B981' : muted} />,
      label: 'Verified ID',
      detail: eligibility.verified ? 'Done' : 'Verify your ID first',
      progress: eligibility.verified ? 1 : 0,
    },
    {
      key: 'rating',
      met: eligibility.rating_ok,
      icon: <Star size={22} color={eligibility.rating_ok ? '#F5A623' : muted} fill={eligibility.rating_ok ? '#F5A623' : 'transparent'} />,
      label: `Rated ${LEADER_REQUIREMENTS.rating}+ by travel buddies`,
      detail:
        eligibility.rating_count === 0
          ? `No ratings yet (need ${LEADER_REQUIREMENTS.ratingCount})`
          : eligibility.rating_count < LEADER_REQUIREMENTS.ratingCount
            ? `${eligibility.avg_rating?.toFixed(1)} from ${eligibility.rating_count} / ${LEADER_REQUIREMENTS.ratingCount} ratings`
            : `${eligibility.avg_rating?.toFixed(1)} from ${eligibility.rating_count}`,
      progress: eligibility.rating_ok
        ? 1
        : Math.min((eligibility.avg_rating ?? 0) / LEADER_REQUIREMENTS.rating, eligibility.rating_count / LEADER_REQUIREMENTS.ratingCount),
    },
  ];

  return (
    <>
      <Card index={index} className="overflow-hidden">
        <View className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#CA8A04]/15" />
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#CA8A04]">
            <Crown size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-black uppercase tracking-[2px] text-[#B45309]">Leadership path</Text>
            <Text className={`text-lg font-black ${primary}`}>Become a Guild Leader</Text>
          </View>
        </View>
        <Text className={`mt-2 text-sm ${secondary}`}>
          Found your own guild, recruit travelers, run guild missions, and earn leader rewards.
        </Text>

        {pending ? (
          <Animated.View key="pending" entering={riseIn(0, 350)} className={`mt-4 flex-row items-center gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#FEF9EC]'}`}>
            <Clock size={20} color="#CA8A04" />
            <View className="flex-1">
              <Text className={`text-sm font-black ${primary}`}>Application under review</Text>
              <Text className={`text-xs ${secondary}`}>
                Proposed guild: {application?.guild_name}. The PartyUp team will notify you.
              </Text>
            </View>
          </Animated.View>
        ) : (
          <View key="checklist" className="mt-4 gap-2.5">
            {requirements.map((item) => (
              <View key={item.key} className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center">{item.icon}</View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-sm font-bold ${primary}`}>{item.label}</Text>
                    {item.met ? <Check size={16} color="#10B981" strokeWidth={3} /> : null}
                  </View>
                  <View className={`mt-1 h-1.5 overflow-hidden rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]'}`}>
                    <View className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, item.progress) * 100)}%`, backgroundColor: item.met ? '#10B981' : '#CA8A04' }} />
                  </View>
                  <Text className={`mt-0.5 text-[11px] ${secondary}`}>{item.detail}</Text>
                </View>
              </View>
            ))}

            {declined ? (
              <Text className="text-xs text-[#B91C1C]">
                Your last application wasn&apos;t approved{application?.admin_notes ? `: ${application.admin_notes}` : '.'} You can apply again.
              </Text>
            ) : null}

            <AnimatedPressable
              onPress={() => {
                setFormError(null);
                setFormVisible(true);
              }}
              disabled={!eligibility.eligible}
              className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
              style={{ backgroundColor: eligibility.eligible ? '#CA8A04' : isDark ? '#22324B' : '#E2E8F0' }}>
              <Crown size={17} color={eligibility.eligible ? '#FFFFFF' : isDark ? '#64748B' : '#94A3B8'} />
              <Text className={`text-base font-black ${eligibility.eligible ? 'text-white' : secondary}`}>
                {eligibility.eligible ? 'Apply to lead a guild' : 'Meet the requirements to apply'}
              </Text>
            </AnimatedPressable>
          </View>
        )}
      </Card>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-center bg-black/45 px-4">
          <Animated.View entering={riseIn(0, 380)} className={`max-h-[90%] w-full max-w-[440px] rounded-[28px] px-4 py-5 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className="flex-row items-start justify-between gap-4 pb-3">
              <View className="flex-1">
                <Text className={`text-headline-24 font-bold ${primary}`}>Leader application</Text>
                <Text className={`mt-1 text-[14px] ${secondary}`}>Tell the PartyUp team about the guild you want to build.</Text>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} className={`h-9 w-9 items-center justify-center rounded-full ${chip}`} accessibilityLabel="Close">
                <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-2">
              <View>
                <Text className={`mb-1.5 text-sm font-semibold ${primary}`}>Guild name</Text>
                <TextInput
                  value={guildName}
                  onChangeText={setGuildName}
                  maxLength={30}
                  placeholder="e.g. Pulilan Pathfinders"
                  placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                  className={`rounded-xl border px-4 py-3 text-[15px] ${input}`}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pt-2">
                  {GUILD_NAME_IDEAS.map((idea) => (
                    <TouchableOpacity key={idea} onPress={() => setGuildName(idea)} className={`rounded-full border px-3 py-1.5 ${chip}`}>
                      <Text className={`text-xs font-semibold ${secondary}`}>{idea}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <Text className={`mb-1.5 text-sm font-semibold ${primary}`}>Why you?</Text>
                <TextInput
                  value={pitch}
                  onChangeText={setPitch}
                  maxLength={300}
                  multiline
                  placeholder="The trips you'd organize, who you'd recruit, how you'd keep members safe…"
                  placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                  className={`min-h-[110px] rounded-xl border px-4 py-3 text-[15px] ${input}`}
                  style={{ textAlignVertical: 'top' }}
                />
                <Text className={`mt-1 text-right text-[11px] ${secondary}`}>{pitch.length}/300</Text>
              </View>

              {formError ? (
                <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
                  <Text className="text-sm text-[#B91C1C]">{formError}</Text>
                </View>
              ) : null}

              <AnimatedPressable
                onPress={() => void submit()}
                disabled={!canSubmit}
                className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${canSubmit ? 'bg-[#CA8A04]' : 'bg-[#94A3B8]'}`}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Crown size={17} color="#FFFFFF" />}
                <Text className="text-base font-bold text-white">Send application</Text>
              </AnimatedPressable>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <SuccessOverlay visible={sent} title="Application sent!" message="The PartyUp team will review it and notify you." onDone={clearSent} />
    </>
  );
}
