import { UserRankTag } from '@/components/guild/UserRankTag';
import { riseIn } from '@/components/ui/motion';
import { getAge } from '@/lib/discover-mock';
import type { SearchProfile } from '@/lib/social';
import { choiceLabel, hasCompletePlan, type PlanCompatibility, type TravelPlan } from '@/lib/travelPlans';
import { useRouter } from 'expo-router';
import { BadgeCheck, MapPin, RotateCcw, Sparkles, Star, UserPlus, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const SWIPE_THRESHOLD = 120;
const VISIBLE_PLAN_CHIPS = 3;

type SwipeCardProps = {
  profile: SearchProfile;
  distanceKm: number;
  plan: TravelPlan | null;
  // null when the viewer has no plan yet, or this traveler doesn't.
  score: PlanCompatibility | null;
  viewerHasPlan: boolean;
  canGoBack: boolean;
  isDark: boolean;
  onConnect: (profile: SearchProfile) => void;
  onPass: (profile: SearchProfile) => void;
  onPrevious: () => void;
  onCreatePlan: () => void;
};

export function SwipeCard({ profile, distanceKm, plan, score, viewerHasPlan, canGoBack, isDark, onConnect, onPass, onPrevious, onCreatePlan }: SwipeCardProps) {
  const router = useRouter();
  const age = getAge(profile.date_of_birth);
  const verified = profile.verification_status === 'approved';
  const trustScore = profile.trust_count > 0 ? profile.trust_score ?? null : null;
  const planChoices = hasCompletePlan(plan) ? [...plan.ride, ...plan.destination, ...plan.food] : [];
  const [matchSheetVisible, setMatchSheetVisible] = useState(false);

  const translateX = useSharedValue(0);

  function viewDetails() {
    router.push({
      pathname: '/profile/[id]',
      params: {
        id: profile.id,
        displayName: profile.display_name,
        interests: JSON.stringify(profile.interests),
        avatarUrl: profile.avatar_url ?? '',
        requestStatus: profile.request_status ?? '',
        requestId: profile.request_id ?? '',
      },
    });
  }

  function handleConnect() {
    onConnect(profile);
  }

  function handlePass() {
    onPass(profile);
  }

  function handleMatchPress() {
    if (score) setMatchSheetVisible(true);
    else if (!viewerHasPlan) onCreatePlan();
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(500, { duration: 200 }, () => {
          translateX.value = 0;
          runOnJS(handleConnect)();
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-500, { duration: 200 }, () => {
          translateX.value = 0;
          runOnJS(handlePass)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { rotate: `${interpolate(translateX.value, [-300, 0, 300], [-12, 0, 12])}deg` }],
  }));
  // The green/red glow and CONNECT / PASS stamps fade in as the card is
  // dragged toward a decision, reaching full strength at the threshold.
  const connectStampStyle = useAnimatedStyle(() => ({ opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp') }));
  const passStampStyle = useAnimatedStyle(() => ({ opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], 'clamp') }));

  const matchLabel = score ? `${score.overall}% match` : viewerHasPlan ? 'No plan yet' : 'Add plan for match %';

  return (
    <>
      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle} className={`flex-1 overflow-hidden rounded-[32px] bg-[#3C5BE0] shadow-lg ${isDark ? 'shadow-black/40' : 'shadow-black/15'}`}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <NoPhotoBackdrop profile={profile} />
          )}

          {/* Darkens the top and bottom so the overlaid text stays readable on any photo. */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
            <Defs>
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000" stopOpacity="0.35" />
                <Stop offset="0.2" stopColor="#000" stopOpacity="0" />
                <Stop offset="0.4" stopColor="#000" stopOpacity="0" />
                <Stop offset="0.75" stopColor="#000" stopOpacity="0.65" />
                <Stop offset="1" stopColor="#000" stopOpacity="0.9" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#scrim)" />
          </Svg>

          {/* Tapping the photo opens the profile; the controls below sit on top of it. */}
          <Pressable onPress={viewDetails} accessibilityLabel={`View ${profile.display_name}'s profile`} style={StyleSheet.absoluteFill} />

          <View className="absolute left-4 right-4 top-4 flex-row items-center justify-between">
            <TouchableOpacity onPress={handleMatchPress} disabled={!score && viewerHasPlan} className="flex-row items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5">
              <Sparkles size={13} color="#FFFFFF" />
              <Text className="text-[13px] font-bold text-white">{matchLabel}</Text>
            </TouchableOpacity>
            <View className="flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1.5">
              {trustScore !== null ? <Star size={13} color="#FFC94A" fill="#FFC94A" /> : null}
              <Text className="text-[13px] font-bold text-white">{trustScore !== null ? trustScore.toFixed(1) : 'New'}</Text>
            </View>
          </View>

          {/* Green glow from the right edge when dragging toward Connect, red from the left toward Pass. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, connectStampStyle]}>
            <View style={StyleSheet.absoluteFill} className="bg-[#22C55E]/15" />
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="glow-connect" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0.45" stopColor="#22C55E" stopOpacity="0" />
                  <Stop offset="1" stopColor="#22C55E" stopOpacity="0.75" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#glow-connect)" />
            </Svg>
            <View style={StyleSheet.absoluteFill} className="rounded-[32px] border-4 border-[#22C55E]" />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, passStampStyle]}>
            <View style={StyleSheet.absoluteFill} className="bg-[#F43F5E]/15" />
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="glow-pass" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#F43F5E" stopOpacity="0.75" />
                  <Stop offset="0.55" stopColor="#F43F5E" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#glow-pass)" />
            </Svg>
            <View style={StyleSheet.absoluteFill} className="rounded-[32px] border-4 border-[#F43F5E]" />
          </Animated.View>

          <Animated.View pointerEvents="none" style={[connectStampStyle, { transform: [{ rotate: '-12deg' }] }]} className="absolute left-6 top-20 rounded-xl border-4 border-[#22C55E] px-3 py-1">
            <Text className="text-2xl font-black tracking-widest text-[#22C55E]">CONNECT</Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[passStampStyle, { transform: [{ rotate: '12deg' }] }]} className="absolute right-6 top-20 rounded-xl border-4 border-[#F43F5E] px-3 py-1">
            <Text className="text-2xl font-black tracking-widest text-[#F43F5E]">PASS</Text>
          </Animated.View>

          <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 px-5 pb-5">
            <View pointerEvents="none">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="shrink text-[28px] font-black text-white">
                  {profile.display_name}
                  {age !== null ? <Text className="font-semibold text-white/80">{`  ${age}`}</Text> : null}
                </Text>
                {verified ? <BadgeCheck size={22} color="#FFFFFF" fill="#179B67" /> : null}
              </View>
              <View className="mt-1 flex-row items-center gap-3">
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color="#FFFFFF" />
                  <Text className="text-[13px] font-semibold text-white/90">{distanceKm} km away</Text>
                </View>
                <UserRankTag userId={profile.id} isDark variant="inline" size={15} />
              </View>
              {profile.bio ? <Text numberOfLines={2} className="mt-2 text-sm leading-5 text-white/85">{profile.bio}</Text> : null}
              {planChoices.length ? (
                <View className="mt-3 flex-row flex-wrap gap-1.5">
                  {planChoices.slice(0, VISIBLE_PLAN_CHIPS).map((value) => (
                    <View key={value} className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1">
                      <Text className="text-xs font-semibold text-white">{choiceLabel(value)}</Text>
                    </View>
                  ))}
                  {planChoices.length > VISIBLE_PLAN_CHIPS ? (
                    <View className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1">
                      <Text className="text-xs font-semibold text-white">+{planChoices.length - VISIBLE_PLAN_CHIPS}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View className="mt-4 flex-row items-center justify-center gap-4">
              <TouchableOpacity onPress={onPrevious} disabled={!canGoBack} accessibilityLabel="Previous traveler" className={`h-11 w-11 items-center justify-center rounded-full bg-white/20 ${canGoBack ? '' : 'opacity-40'}`}>
                <RotateCcw size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePass} accessibilityLabel="Pass" className="h-14 w-14 items-center justify-center rounded-full bg-white shadow-md shadow-black/20">
                <X size={26} color="#F43F5E" strokeWidth={2.75} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConnect} accessibilityLabel="Connect" className="h-14 w-14 items-center justify-center rounded-full bg-[#284BD6] shadow-md shadow-black/20">
                <UserPlus size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={viewDetails} accessibilityLabel="View details" className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
                <UserRound size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      <Modal visible={matchSheetVisible} transparent animationType="fade" onRequestClose={() => setMatchSheetVisible(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setMatchSheetVisible(false)}>
          {matchSheetVisible ? (
            <Animated.View key="match-sheet" entering={riseIn(0, 320)}>
              <Pressable className={`rounded-t-[28px] px-5 pb-10 pt-5 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
                <View className="flex-row items-center justify-between">
                  <Text className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#182847]'}`}>Why you match</Text>
                  <Text className="text-lg font-black text-[#284BD6]">{score ? `${score.overall}%` : ''}</Text>
                </View>
                {score ? (
                  <View className="mt-4 gap-3">
                    <MatchRow label="Ride" value={score.ride} isDark={isDark} />
                    <MatchRow label="Destination" value={score.destination} isDark={isDark} />
                    <MatchRow label="Food & drinks" value={score.food} isDark={isDark} />
                    <MatchRow label="Preferred buddy" value={score.gender} isDark={isDark} />
                    {score.missions !== null ? <MatchRow label="Missions" value={score.missions} isDark={isDark} /> : null}
                  </View>
                ) : null}
                {planChoices.length ? (
                  <View className="mt-5 flex-row flex-wrap gap-2">
                    {planChoices.map((value) => (
                      <View key={value} className={`rounded-full px-3 py-1.5 ${isDark ? 'bg-[#284BD6]/25' : 'bg-[#284BD6]/10'}`}>
                        <Text className={`text-[13px] font-semibold ${isDark ? 'text-[#AFC0FF]' : 'text-[#284BD6]'}`}>{choiceLabel(value)}</Text>
                      </View>
                    ))}
                    {plan?.missions ? (
                      <View className="rounded-full bg-[#F5A623]/15 px-3 py-1.5"><Text className="text-[13px] font-semibold text-[#D88700]">Mission completion</Text></View>
                    ) : null}
                  </View>
                ) : null}
                {plan?.description ? (
                  <View className={`mt-4 rounded-2xl px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-[#F4F6FA]'}`}>
                    <Text className={`text-sm italic leading-5 ${isDark ? 'text-white' : 'text-[#182847]'}`}>“{plan.description}”</Text>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

// Gradient pairs for travelers without a photo; each person always gets the
// same one (picked from their id) so their card is recognizable.
const NO_PHOTO_GRADIENTS: [string, string][] = [
  ['#284BD6', '#7C3AED'],
  ['#0EA5E9', '#284BD6'],
  ['#F43F5E', '#F59E0B'],
  ['#10B981', '#0EA5E9'],
  ['#8B5CF6', '#EC4899'],
  ['#F97316', '#E11D48'],
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function NoPhotoBackdrop({ profile }: { profile: SearchProfile }) {
  let hash = 0;
  for (const char of profile.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [from, to] = NO_PHOTO_GRADIENTS[hash % NO_PHOTO_GRADIENTS.length];
  const interests = profile.interests.slice(0, 3);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="no-photo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#no-photo)" />
      </Svg>

      {/* Soft decorative bubbles so the card doesn't read as a flat block. */}
      <View className="absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10" />
      <View className="absolute -left-20 top-1/3 h-48 w-48 rounded-full bg-white/10" />
      <View className="absolute right-8 top-1/2 h-16 w-16 rounded-full bg-white/10" />

      <View className="flex-1 items-center justify-center pb-48">
        <View className="h-32 w-32 items-center justify-center rounded-full border-4 border-white/40 bg-white/20">
          <Text className="text-5xl font-black text-white">{initialsOf(profile.display_name)}</Text>
        </View>
        {interests.length ? (
          <View className="mt-5 flex-row flex-wrap justify-center gap-2 px-8">
            {interests.map((interest) => (
              <View key={interest} className="rounded-full bg-white/20 px-3 py-1">
                <Text className="text-xs font-semibold text-white">{interest}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-4 text-sm font-semibold text-white/80">No photo yet</Text>
        )}
      </View>
    </View>
  );
}

function MatchRow({ label, value, isDark }: { label: string; value: number; isDark: boolean }) {
  return (
    <View className="flex-row items-center gap-3">
      <Text className={`w-[110px] text-[13px] font-medium ${isDark ? 'text-[#CBD5E1]' : 'text-[#4B5873]'}`}>{label}</Text>
      <View className={`h-1.5 flex-1 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-[#E8ECF4]'}`}>
        <View className="h-full rounded-full bg-[#284BD6]" style={{ width: `${value}%` }} />
      </View>
      <Text className={`w-10 text-right text-[13px] font-bold ${isDark ? 'text-white' : 'text-[#182847]'}`}>{value}%</Text>
    </View>
  );
}
