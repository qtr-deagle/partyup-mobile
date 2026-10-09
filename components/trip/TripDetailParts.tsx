import { Image } from 'expo-image';
import { ArrowLeft, Car, Lock, MapPin } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { VEHICLE_COLORS, VEHICLE_TYPE_LABEL, type TripVehicle } from '@/lib/vehicles';

// Building blocks for the trip detail screen (app/trip/[id].tsx).

export const TRIP_BLUE = '#2A55D4';

export const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#6A758F' },
  open: { label: 'Open', color: '#19A06B' },
  full: { label: 'Full', color: '#B4650B' },
  ongoing: { label: 'On the road', color: TRIP_BLUE },
  completed: { label: 'Completed', color: '#19A06B' },
  cancelled: { label: 'Cancelled', color: '#E32727' },
};

export function tripPalette(isDark: boolean) {
  return {
    background: isDark ? '#0B1220' : '#F4F6FB',
    card: isDark ? '#111B2E' : '#FFFFFF',
    border: isDark ? '#1E2A40' : '#E8ECF4',
    soft: isDark ? '#18253C' : '#F2F5FB',
    primary: isDark ? '#FFFFFF' : '#16203A',
    secondary: isDark ? '#94A3B8' : '#6A758F',
    accent: isDark ? '#A5B8FF' : TRIP_BLUE,
  };
}

type Palette = ReturnType<typeof tripPalette>;

/** Round icon button used on the blue hero. */
export function HeroIconButton({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityLabel={label} className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
      {children}
    </TouchableOpacity>
  );
}

export function TripHero({
  topInset,
  onBack,
  actions,
  typeLabel,
  status,
  title,
  origin,
  destination,
  stopCount,
}: {
  topInset: number;
  onBack: () => void;
  actions?: ReactNode;
  typeLabel: string;
  status: string | null;
  title: string;
  origin: string | null;
  destination: string;
  stopCount: number;
}) {
  const meta = status ? STATUS_META[status] : null;
  return (
    <View className="overflow-hidden rounded-b-[32px] px-5 pb-16" style={{ backgroundColor: TRIP_BLUE, paddingTop: topInset + 8 }}>
      {/* Decorative circles */}
      <View className="absolute -right-16 -top-10 h-48 w-48 rounded-full bg-white/10" />
      <View className="absolute -left-10 bottom-4 h-28 w-28 rounded-full bg-white/5" />

      <View className="flex-row items-center justify-between">
        <HeroIconButton onPress={onBack} label="Go back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </HeroIconButton>
        <View className="flex-row gap-2">{actions}</View>
      </View>

      <View className="mt-5 flex-row items-center gap-2">
        <View className="rounded-full bg-white/15 px-3 py-1">
          <Text className="text-[11px] font-extrabold uppercase tracking-[1px] text-white">{typeLabel}</Text>
        </View>
        {meta ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
            <Text className="text-[11px] font-extrabold" style={{ color: meta.color }}>{meta.label}</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-3 text-[26px] font-black leading-8 text-white" numberOfLines={2}>{title}</Text>

      <View className="mt-4 flex-row gap-3 rounded-2xl bg-white/10 px-4 py-3">
        <View className="items-center py-1">
          <View className="h-2.5 w-2.5 rounded-full border-2 border-white" />
          <View className="my-1 w-0.5 flex-1 rounded-full bg-white/40" />
          <MapPin size={13} color="#FFFFFF" />
        </View>
        <View className="flex-1 gap-2.5">
          <Text numberOfLines={1} className="text-[14px] font-semibold text-white/75">
            {origin ?? 'Meetup point'}
            {stopCount > 0 ? `  ·  ${stopCount} stop${stopCount > 1 ? 's' : ''}` : ''}
          </Text>
          <Text numberOfLines={1} className="text-[15px] font-bold text-white">{destination}</Text>
        </View>
      </View>
    </View>
  );
}

/** Three-up stat row that overlaps the bottom of the hero. */
export function StatRow({ items, palette }: { items: { icon: ReactNode; label: string; value: string }[]; palette: Palette }) {
  return (
    <View className="-mt-11 mx-4 flex-row rounded-3xl border p-1.5" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
      {items.map((item, index) => (
        <View
          key={item.label}
          className="flex-1 items-center px-1 py-3"
          style={index > 0 ? { borderLeftWidth: 1, borderColor: palette.border } : undefined}>
          {item.icon}
          <Text className="mt-1.5 text-[14px] font-extrabold" style={{ color: palette.primary }} numberOfLines={1}>{item.value}</Text>
          <Text className="mt-0.5 text-[11px] font-semibold" style={{ color: palette.secondary }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Section({
  icon,
  title,
  right,
  children,
  palette,
}: {
  icon?: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  palette: Palette;
}) {
  return (
    <View className="rounded-3xl border p-4" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
      <View className="mb-3 flex-row items-center gap-2">
        {icon}
        <Text className="flex-1 text-[16px] font-extrabold" style={{ color: palette.primary }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View className="items-center justify-center" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#DCE5FF' }}>
      <Text className="font-extrabold" style={{ color: TRIP_BLUE, fontSize: size * 0.36 }}>{initials || '?'}</Text>
    </View>
  );
}

/** Full route with numbered stops. */
export function RouteTimeline({ points, palette }: { points: { label: string; kind: 'start' | 'stop' | 'end' }[]; palette: Palette }) {
  return (
    <View>
      {points.map((point, index) => {
        const last = index === points.length - 1;
        return (
          <View key={`${point.label}-${index}`} className="flex-row gap-3">
            <View className="w-6 items-center">
              {point.kind === 'end' ? (
                <MapPin size={18} color={TRIP_BLUE} fill={palette.soft} />
              ) : point.kind === 'start' ? (
                <View className="mt-0.5 h-4 w-4 rounded-full border-[3px]" style={{ borderColor: TRIP_BLUE }} />
              ) : (
                <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: palette.soft }}>
                  <Text className="text-[9px] font-black" style={{ color: TRIP_BLUE }}>{index}</Text>
                </View>
              )}
              {last ? null : <View className="my-1 w-0.5 flex-1 rounded-full" style={{ backgroundColor: palette.border, minHeight: 14 }} />}
            </View>
            <Text
              className={`flex-1 pb-3 text-[14px] ${point.kind === 'stop' ? 'font-medium' : 'font-bold'}`}
              style={{ color: point.kind === 'stop' ? palette.secondary : palette.primary }}>
              {point.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function KeyValue({ label, value, valueColor, palette, bold }: { label: string; value: string; valueColor?: string; palette: Palette; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className={`text-[14px] ${bold ? 'font-bold' : ''}`} style={{ color: bold ? palette.primary : palette.secondary }}>{label}</Text>
      <Text className={`text-[14px] ${bold ? 'font-extrabold' : 'font-semibold'}`} style={{ color: valueColor ?? palette.primary }}>{value}</Text>
    </View>
  );
}

/**
 * The car riders should look for. The plate is only sent to the driver and
 * accepted riders (get_trip_vehicle), so others see a locked hint instead.
 */
export function TripVehicleCard({ vehicle, palette, isDriver }: { vehicle: TripVehicle; palette: Palette; isDriver: boolean }) {
  const swatch = VEHICLE_COLORS.find((color) => color.name.toLowerCase() === vehicle.color?.toLowerCase())?.hex;
  const details = [vehicle.vehicle_type ? VEHICLE_TYPE_LABEL[vehicle.vehicle_type] : null, vehicle.year ? String(vehicle.year) : null, vehicle.seat_capacity ? `${vehicle.seat_capacity} seats` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Section palette={palette} icon={<Car size={18} color={palette.accent} />} title={isDriver ? 'Your car' : 'Look for this car'}>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: palette.soft }}>
          <Car size={24} color={palette.accent} />
          {swatch ? (
            <View
              className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: swatch, borderWidth: 1.5, borderColor: palette.card }}
            />
          ) : null}
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-extrabold" style={{ color: palette.primary }} numberOfLines={1}>
            {[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          </Text>
          {details ? (
            <Text className="mt-0.5 text-[13px]" style={{ color: palette.secondary }}>
              {details}
            </Text>
          ) : null}
        </View>
        {vehicle.plate_number ? (
          <View className="rounded-lg border-2 px-2.5 py-1" style={{ borderColor: palette.primary, backgroundColor: palette.card }}>
            <Text className="text-[15px] font-black tracking-[1.5px]" style={{ color: palette.primary }}>
              {vehicle.plate_number}
            </Text>
          </View>
        ) : null}
      </View>
      {vehicle.plate_number ? null : (
        <View className="mt-3 flex-row items-center gap-1.5">
          <Lock size={13} color={palette.secondary} />
          <Text className="text-[12.5px]" style={{ color: palette.secondary }}>
            The plate number shows once your seat is accepted.
          </Text>
        </View>
      )}
    </Section>
  );
}
