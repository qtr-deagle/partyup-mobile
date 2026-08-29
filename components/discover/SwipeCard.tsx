import type { CompatibilityScore } from '@/lib/compatibility';
import { formatDateShort, getAge, type MockTripData } from '@/lib/discover-mock';
import type { SearchProfile } from '@/lib/social';
import { useRouter } from 'expo-router';
import { BadgeCheck, MapPin, Star } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const SWIPE_THRESHOLD = 120;

type SwipeCardProps = {
  profile: SearchProfile;
  trip: MockTripData;
  score: CompatibilityScore;
  isDark: boolean;
  onConnect: (profile: SearchProfile) => void;
  onPass: (profile: SearchProfile) => void;
};

export function SwipeCard({ profile, trip, score, isDark, onConnect, onPass }: SwipeCardProps) {
  const router = useRouter();
  const age = getAge(profile.date_of_birth);
  const verified = profile.verification_status === 'approved';

  const translateX = useSharedValue(0);

  const cardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const headerBackground = isDark ? 'bg-[#18253C]' : 'bg-[#F6F7FB]';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';

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

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={cardStyle} className={`overflow-hidden rounded-[28px] border shadow-sm ${cardBackground} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
        <View className={`flex-row items-start justify-between px-5 pb-4 pt-5 ${headerBackground}`}>
          <View className="flex-1 pr-3">
            <View className="flex-row items-center gap-1.5">
              <Text className={`text-2xl font-black ${textPrimary}`}>{profile.display_name}{age !== null ? `, ${age}` : ''}</Text>
              {verified ? <BadgeCheck size={20} color="#179B67" /> : null}
            </View>
            <Text numberOfLines={1} className={`mt-2 text-[15px] leading-5 ${textSecondary}`}>{profile.bio || 'This traveler hasn’t added a bio yet.'}</Text>
            <View className="mt-3 flex-row items-center gap-1.5">
              <MapPin size={15} color="#284BD6" />
              <Text className="text-[13px] font-semibold text-[#284BD6]">{trip.distanceKm} km away</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm">
            {profile.trust_count > 0 && profile.trust_score !== null && profile.trust_score !== undefined ? (
              <>
                <Star size={14} color="#F5A623" fill="#F5A623" />
                <Text className="text-[13px] font-bold text-[#182847]">{profile.trust_score.toFixed(1)}</Text>
              </>
            ) : (
              <Text className="text-[13px] font-bold text-[#182847]">New</Text>
            )}
          </View>
        </View>

        <View className="gap-2 px-5 py-4">
          <View className="flex-row items-center justify-between">
            <Text className={`text-sm ${textSecondary}`}>Route</Text>
            <Text className={`text-sm font-bold ${textPrimary}`}>{trip.route.origin} → {trip.route.destination}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className={`text-sm ${textSecondary}`}>Dates</Text>
            <Text className={`text-sm font-bold ${textPrimary}`}>{formatDateShort(trip.dates.start)} - {formatDateShort(trip.dates.end)}</Text>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="rounded-full border border-[#284BD6] px-3 py-1.5"><Text className="text-[13px] font-bold text-[#284BD6]">{trip.purpose}</Text></View>
            <View className={`rounded-full px-3 py-1.5 ${isDark ? 'bg-[#22324B]' : 'bg-[#F1F3F8]'}`}><Text className={`text-[13px] font-semibold ${textPrimary}`}>{trip.vibeTag}</Text></View>
          </View>

          <View className="mt-3 flex-row items-center justify-between border-t border-[#22324B]/20 pt-3">
            <Text className={`text-sm font-bold ${textPrimary}`}>Overall Match</Text>
            <Text className="text-lg font-black text-[#284BD6]">{score.overall}%</Text>
          </View>
        </View>

        <View className="flex-row gap-3 px-5 pb-5">
          <TouchableOpacity onPress={viewDetails} className={`flex-1 items-center justify-center rounded-2xl border py-3 ${isDark ? 'border-[#22324B]' : 'border-[#D8E0EE]'}`}>
            <Text className={`font-bold ${textPrimary}`}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleConnect} className="flex-1 items-center justify-center rounded-2xl bg-[#284BD6] py-3">
            <Text className="font-bold text-white">Connect</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
