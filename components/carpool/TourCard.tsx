import { DateTile } from '@/components/carpool/DateTile';
import { formatCurrency } from '@/lib/carpool';
import type { TourCard as TourCardType } from '@/lib/tours';
import { BadgeCheck, Clock, Heart, MapPin, Users } from 'lucide-react-native';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  tour: TourCardType;
  isDark: boolean;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onToggleFavorite?: () => void;
  primaryActionBusy?: boolean;
  // Replaces the per-person price line (carpools have no fixed price).
  priceLabel?: string;
};

export function TourCard({ tour, isDark, primaryActionLabel, onPrimaryAction, onToggleFavorite, primaryActionBusy, priceLabel }: Props) {
  const primary = isDark ? '#FFFFFF' : '#1D2746';
  const muted = isDark ? '#94A3B8' : '#6A758F';
  const softFill = isDark ? '#18253C' : '#F1F4FA';
  const seatsLeft = tour.seats_total ? Math.max(tour.seats_total - tour.rider_count, 0) : null;
  const fill = tour.seats_total ? Math.min(tour.rider_count / tour.seats_total, 1) : 0;

  return (
    <View
      className="rounded-[26px] border p-4"
      style={{
        backgroundColor: isDark ? '#111B2E' : '#FFFFFF',
        borderColor: isDark ? '#1E2A40' : '#EDF0F6',
        shadowColor: '#0F1B3D',
        shadowOpacity: isDark ? 0 : 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: isDark ? 0 : 2,
      }}>
      <View className="flex-row items-start gap-3.5">
        <DateTile value={tour.start_at} isDark={isDark} />
        <View className="flex-1">
          <Text numberOfLines={2} className="text-[18px] font-extrabold leading-6 tracking-tight" style={{ color: primary }}>{tour.title}</Text>
          <View className="mt-1 flex-row items-center gap-1">
            <MapPin size={13} color="#2A55D4" />
            <Text numberOfLines={1} className="flex-1 text-[13px] font-semibold" style={{ color: muted }}>{tour.destination}</Text>
          </View>
        </View>
        {onToggleFavorite ? (
          <TouchableOpacity onPress={onToggleFavorite} accessibilityLabel="Toggle favorite" className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: softFill }}>
            <Heart size={18} color={tour.is_favorited ? '#E32727' : muted} fill={tour.is_favorited ? '#E32727' : 'transparent'} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View className="mt-3.5 flex-row flex-wrap items-center gap-2">
        <View className="flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5" style={{ backgroundColor: softFill }}>
          <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: isDark ? '#22324B' : '#DCE5FF' }}>
            <Text className="text-[10px] font-black" style={{ color: isDark ? '#CBD5E1' : '#2A55D4' }}>{tour.organizer_display_name.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <Text numberOfLines={1} className="max-w-[140px] text-[12px] font-bold" style={{ color: primary }}>{tour.organizer_display_name}</Text>
          {tour.organizer_verified ? <BadgeCheck size={13} color="#179B67" /> : null}
        </View>
        {tour.duration_days ? (
          <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: softFill }}>
            <Clock size={12} color={muted} />
            <Text className="text-[12px] font-bold" style={{ color: muted }}>{tour.duration_days} day{tour.duration_days > 1 ? 's' : ''}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: softFill }}>
          <Users size={12} color={muted} />
          <Text className="text-[12px] font-bold" style={{ color: muted }}>
            {tour.rider_count}{tour.seats_total ? `/${tour.seats_total}` : ''} joined
          </Text>
        </View>
      </View>

      {tour.interest_tags.length > 0 ? (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5">
          {tour.interest_tags.map((tag) => (
            <View key={tag} className="rounded-full px-2.5 py-1" style={{ backgroundColor: isDark ? '#1A2850' : '#EAF0FF' }}>
              <Text className="text-[11.5px] font-bold" style={{ color: isDark ? '#A5B8FF' : '#2A55D4' }}>#{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {tour.seats_total ? (
        <View className="mt-3.5">
          <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: softFill }}>
            <View className="h-full rounded-full" style={{ width: `${fill * 100}%`, backgroundColor: seatsLeft === 0 ? '#B4650B' : '#19A06B' }} />
          </View>
          <Text className="mt-1 text-[11.5px] font-semibold" style={{ color: seatsLeft === 0 ? '#B4650B' : muted }}>
            {seatsLeft === 0 ? 'Full' : `${seatsLeft} ${seatsLeft === 1 ? 'spot' : 'spots'} left`}
          </Text>
        </View>
      ) : null}

      <View className="mt-3.5 flex-row items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: isDark ? '#1E2A40' : '#F0F2F7' }}>
        <Text numberOfLines={1} className="flex-1 text-[16px] font-black" style={{ color: primary }}>
          {priceLabel ?? (tour.price_per_person !== null ? `${formatCurrency(tour.price_per_person)} / person` : 'Price not set')}
        </Text>
        <TouchableOpacity onPress={onPrimaryAction} disabled={primaryActionBusy} activeOpacity={0.85} className="min-w-[110px] items-center rounded-full bg-[#2A55D4] px-5 py-2.5">
          {primaryActionBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text className="text-[14px] font-bold text-white">{primaryActionLabel}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
