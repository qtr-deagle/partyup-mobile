import { formatCurrency } from '@/lib/carpool';
import { parseTimestamp } from '@/lib/datetime';
import type { TourCard as TourCardType } from '@/lib/tours';
import { BadgeCheck, CalendarDays, Heart, MapPin, Users } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';

function formatTourDate(value: string | null) {
  if (!value) {
    return 'Date TBD';
  }
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Props = {
  tour: TourCardType;
  isDark: boolean;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onToggleFavorite?: () => void;
  primaryActionBusy?: boolean;
};

export function TourCard({ tour, isDark, primaryActionLabel, onPrimaryAction, onToggleFavorite, primaryActionBusy }: Props) {
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';
  const joinedLabel = `${tour.rider_count}${tour.seats_total ? `/${tour.seats_total}` : ''} joined`;

  return (
    <View className={`rounded-[22px] border p-5 shadow-sm ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text className={`text-headline-24 font-bold ${primaryText}`}>{tour.title}</Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <MapPin size={14} color="#2A55D4" />
            <Text className={`text-sm ${mutedText}`}>{tour.destination}</Text>
          </View>
        </View>
        {onToggleFavorite ? (
          <TouchableOpacity onPress={onToggleFavorite} accessibilityLabel="Toggle favorite" className="h-10 w-10 items-center justify-center">
            <Heart size={22} color={tour.is_favorited ? '#E32727' : '#8A93A6'} fill={tour.is_favorited ? '#E32727' : 'transparent'} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View className="mt-3 flex-row items-center gap-1.5">
        <Text className={`text-sm font-semibold ${primaryText}`}>{tour.organizer_display_name}</Text>
        {tour.organizer_verified ? <BadgeCheck size={16} color="#179B67" /> : null}
      </View>

      <View className="mt-4 gap-2.5">
        <View className="flex-row items-center gap-3">
          <CalendarDays size={16} color="#2A55D4" />
          <Text className={`text-sm ${primaryText}`}>
            {formatTourDate(tour.start_at)}
            {tour.duration_days ? ` · ${tour.duration_days} day${tour.duration_days > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Users size={16} color="#2A55D4" />
          <Text className={`text-sm ${primaryText}`}>{joinedLabel}</Text>
        </View>
      </View>

      {tour.interest_tags.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {tour.interest_tags.map((tag) => (
            <View key={tag} className={`rounded-full px-3 py-1 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <Text className="text-xs font-semibold text-[#2A55D4]">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between">
        <Text className={`text-base font-black ${primaryText}`}>
          {tour.price_per_person !== null ? `${formatCurrency(tour.price_per_person)} / person` : 'Price not set'}
        </Text>
        <TouchableOpacity onPress={onPrimaryAction} disabled={primaryActionBusy} className="rounded-2xl bg-[#2A55D4] px-5 py-3">
          <Text className="text-sm font-bold text-white">{primaryActionBusy ? 'Joining…' : primaryActionLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
