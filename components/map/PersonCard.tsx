import { riseIn } from '@/components/ui/motion';
import { Flag, MessageCircle, Navigation2, Shield, X } from 'lucide-react-native';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

export type PersonCardData = {
  id: string;
  name: string;
  avatarUrl: string | null;
  kind: 'trusted' | 'pair';
  color: string;
  distanceLabel: string | null;
  updatedAt: string | null;
};

type PersonCardProps = {
  person: PersonCardData;
  isDark: boolean;
  messaging: boolean;
  stoppingShare: boolean;
  onMessage: () => void;
  onDirections: () => void;
  onStopSharing: () => void;
  onClose: () => void;
};

function timeAgo(iso: string | null) {
  if (!iso) {
    return null;
  }
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return 'Updated just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `Updated ${hours} h ago` : 'Updated over a day ago';
}

// Floating card for the person whose pin was tapped.
export default function PersonCard({ person, isDark, messaging, stoppingShare, onMessage, onDirections, onStopSharing, onClose }: PersonCardProps) {
  const primary = isDark ? 'text-white' : 'text-[#17233F]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';
  const details = [person.distanceLabel, timeAgo(person.updatedAt)].filter(Boolean).join(' · ');

  return (
    <Animated.View
      key={person.id}
      entering={riseIn(0, 260)}
      className={`rounded-[22px] border px-4 py-3.5 shadow-lg ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/40' : 'border-[#EBEFF7] bg-white shadow-black/15'}`}>
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center overflow-hidden rounded-full"
          style={{ borderWidth: 3, borderColor: person.color, backgroundColor: person.avatarUrl ? '#CBD5E1' : person.color }}>
          {person.avatarUrl ? (
            <Image source={{ uri: person.avatarUrl }} style={{ width: 42, height: 42 }} />
          ) : (
            <Text className="text-[16px] font-bold text-white">{person.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className={`text-[16px] font-bold ${primary}`}>{person.name}</Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            {person.kind === 'trusted' && <Shield size={12} color={person.color} />}
            <Text className="text-[12px] font-semibold" style={{ color: person.color }}>
              {person.kind === 'trusted' ? 'Trusted circle' : 'Sharing until you meet'}
            </Text>
          </View>
          {details ? <Text className={`mt-0.5 text-[12px] ${secondary}`}>{details}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Close"
          className={`h-8 w-8 items-center justify-center self-start rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#F1F4FA]'}`}>
          <X size={16} color={isDark ? '#CBD5E1' : '#6B7590'} />
        </TouchableOpacity>
      </View>

      <View className="mt-3 flex-row gap-2">
        <TouchableOpacity onPress={onMessage} disabled={messaging} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2246C7] py-2.5">
          {messaging ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MessageCircle size={16} color="#FFFFFF" />
              <Text className="text-[14px] font-bold text-white">Message</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDirections}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-2.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
          <Navigation2 size={16} color="#2246C7" />
          <Text className="text-[14px] font-bold text-[#2246C7]">Directions</Text>
        </TouchableOpacity>
      </View>
      {person.kind === 'pair' && (
        <TouchableOpacity onPress={onStopSharing} disabled={stoppingShare} className="mt-2 items-center rounded-2xl border border-[#D93025]/40 py-2">
          {stoppingShare ? <ActivityIndicator color="#D93025" /> : <Text className="text-[13px] font-semibold text-[#D93025]">Stop sharing</Text>}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

type MeetupCardProps = {
  tripTitle: string;
  label: string;
  distanceLabel: string | null;
  isDark: boolean;
  onDirections: () => void;
  onOpenTrip: () => void;
  onClose: () => void;
};

// Floating card for the active trip's meetup pin.
export function MeetupCard({ tripTitle, label, distanceLabel, isDark, onDirections, onOpenTrip, onClose }: MeetupCardProps) {
  const primary = isDark ? 'text-white' : 'text-[#17233F]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';

  return (
    <Animated.View
      key="meetup-card"
      entering={riseIn(0, 260)}
      className={`rounded-[22px] border px-4 py-3.5 shadow-lg ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/40' : 'border-[#EBEFF7] bg-white shadow-black/15'}`}>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-[#F97316]">
          <Flag size={20} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className="text-[12px] font-semibold text-[#F97316]">Trip meetup</Text>
          <Text numberOfLines={1} className={`text-[16px] font-bold ${primary}`}>{label}</Text>
          <Text numberOfLines={1} className={`mt-0.5 text-[12px] ${secondary}`}>
            {[tripTitle, distanceLabel].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Close"
          className={`h-8 w-8 items-center justify-center self-start rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#F1F4FA]'}`}>
          <X size={16} color={isDark ? '#CBD5E1' : '#6B7590'} />
        </TouchableOpacity>
      </View>
      <View className="mt-3 flex-row gap-2">
        <TouchableOpacity onPress={onDirections} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-2.5">
          <Navigation2 size={16} color="#FFFFFF" />
          <Text className="text-[14px] font-bold text-white">Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenTrip}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-2.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
          <Text className="text-[14px] font-bold text-[#2246C7]">Open trip</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
