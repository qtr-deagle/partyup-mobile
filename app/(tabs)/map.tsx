import { useColorScheme } from '@/hooks/use-color-scheme';
import { EyeOff, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

type Traveler = {
  id: number;
  name: string;
  distance: string;
  matched?: boolean;
  tone: 'green' | 'muted';
};

const travelers: Traveler[] = [
  { id: 1, name: 'Sarah', distance: '2.3 km', matched: true, tone: 'green' },
  { id: 2, name: 'Mike', distance: '1.8 km', tone: 'muted' },
];

function RoadLine({ className, color }: { className: string; color: string }) {
  return <View className={`absolute h-2 rounded-full ${className}`} style={{ backgroundColor: color }} />;
}

export default function MapScreen() {
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler>(travelers[0]);
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FB]';
  const mapShellBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-black/5 bg-[#EAF0F5]';
  const mapInnerBackground = isDark ? 'bg-[#0F172A]' : 'bg-[#EEF3F8]';
  const infoCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#B8C7FA] bg-[#F4F7FF]';
  const travelerCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#EBEFF7] bg-white';
  const primaryText = isDark ? 'text-white' : 'text-[#17233F]';
  const secondaryText = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className="px-4 pt-4">
        <View className={`relative h-[380px] overflow-hidden rounded-[28px] border shadow-sm ${mapShellBackground} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
          <View className={`absolute inset-0 ${mapInnerBackground}`} />

          <View className="absolute inset-0 opacity-55">
            <View className="absolute inset-0">
              <View className="absolute left-0 top-0 h-full w-full">
                {Array.from({ length: 14 }).map((_, index) => (
                  <View
                    key={`v-${index}`}
                    className="absolute top-0 h-full w-px bg-white/70"
                    style={{ left: `${index * 8}%` }}
                  />
                ))}
                {Array.from({ length: 10 }).map((_, index) => (
                  <View
                    key={`h-${index}`}
                    className="absolute left-0 w-full h-px bg-white/70"
                    style={{ top: `${index * 10}%` }}
                  />
                ))}
              </View>
            </View>
          </View>

          <View className="absolute inset-0">
            <RoadLine className="left-[-8%] top-[15%] w-[86%] rotate-[14deg]" color="#d93025" />
            <RoadLine className="left-[8%] top-[20%] w-[88%] rotate-[14deg]" color="#41c64d" />
            <RoadLine className="left-[26%] top-[58%] w-[70%] rotate-[8deg]" color="#d93025" />
            <RoadLine className="left-[22%] top-[61%] w-[72%] rotate-[8deg]" color="#41c64d" />
            <RoadLine className="left-[9%] top-[6%] w-[84%] -rotate-[20deg]" color="#41c64d" />
            <RoadLine className="left-[35%] top-[34%] w-[42%] rotate-[24deg]" color="#41c64d" />
            <RoadLine className="left-[55%] top-[46%] w-[22%] rotate-[24deg]" color="#d93025" />
            <RoadLine className="left-[38%] top-[40%] w-[24%] rotate-[-26deg]" color="#41c64d" />
          </View>

          <View className="absolute left-[8%] top-[10%] rounded-full bg-white/70 px-2 py-1">
            <Text className="text-[12px] font-semibold text-[#4A566D]">Kalayaan Avenue</Text>
          </View>
          <View className="absolute left-[26%] top-[24%] rounded-full bg-white/70 px-2 py-1">
            <Text className="text-[12px] font-semibold text-[#4A566D]">Manila South Cemetery</Text>
          </View>
          <View className="absolute right-[20%] top-[28%] rounded-full bg-white/70 px-2 py-1">
            <Text className="text-[12px] font-semibold text-[#4A566D]">BEL-AIR</Text>
          </View>
          <View className="absolute left-[20%] bottom-[16%] rounded-full bg-white/70 px-2 py-1">
            <Text className="text-[12px] font-semibold text-[#4A566D]">Arnaiz Avenue</Text>
          </View>

          <View className="absolute left-[44%] top-[53%] h-5 w-5 rounded-full bg-[#2D53D4]" />
          <View className="absolute right-[8%] top-[54%] h-6 w-6 rounded-full bg-[#0D9B6C]" />

          <View className={`absolute left-[-6px] top-[95px] w-[120px] rounded-2xl px-4 py-4 shadow-sm ${isDark ? 'bg-[#111B2E] shadow-black/20' : 'bg-white shadow-black/10'}`}>
            <TouchableOpacity className="absolute right-2 top-1">
              <Text className={`text-[12px] ${secondaryText}`}>×</Text>
            </TouchableOpacity>
            <Text className={`text-[16px] font-medium ${primaryText}`}>Sarah</Text>
            <Text className={`mt-1 text-[14px] ${secondaryText}`}>2.3 km away</Text>
          </View>

          <TouchableOpacity className={`absolute right-3 top-3 h-12 w-12 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#111B2E] shadow-black/20' : 'bg-white shadow-black/15'}`}>
            <EyeOff size={20} color="#65728B" />
          </TouchableOpacity>

          <View className={`absolute bottom-3 left-3 right-3 rounded-full px-2 py-1 shadow-sm ${isDark ? 'bg-[#0F172A]/80 shadow-black/20' : 'bg-white/80 shadow-black/10'}`}>
            <Text className={`text-[11px] ${secondaryText}`}>Mapbox</Text>
          </View>
        </View>

        <View className={`mt-4 rounded-[20px] border px-4 py-4 ${infoCardBackground}`}>
          <View className="flex-row items-start gap-2">
            <Text className="text-[#2246C7]">✓</Text>
            <Text className="flex-1 text-[15px] leading-6 text-[#2246C7]">Your location is hidden until you match with someone</Text>
          </View>
        </View>

        <Text className={`mt-5 text-[28px] font-black ${primaryText}`}>Nearby Travelers</Text>

        <View className="mt-5 gap-3">
          {travelers.map((traveler) => {
            const isSelected = selectedTraveler.id === traveler.id;

            return (
              <TouchableOpacity
                key={traveler.id}
                onPress={() => setSelectedTraveler(traveler)}
                className={`rounded-[18px] border px-4 py-4 shadow-sm ${travelerCardBackground} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className={`h-4 w-4 rounded-full ${traveler.tone === 'green' ? 'bg-[#179B67]' : 'bg-[#C4CDEB]'}`} />
                    <View>
                      <Text className={`text-[16px] font-semibold ${primaryText}`}>{traveler.name}</Text>
                      <Text className={`text-[14px] ${secondaryText}`}>{traveler.distance}</Text>
                    </View>
                  </View>

                  {traveler.matched ? (
                    <View className="rounded-full bg-[#E7F6EF] px-3 py-1.5">
                      <Text className="text-[14px] font-semibold text-[#179B67]">✓ Matched</Text>
                    </View>
                  ) : (
                    <View className="h-2.5 w-2.5 rounded-full bg-transparent" />
                  )}
                </View>

                {isSelected && (
                  <View className={`mt-3 flex-row items-center gap-2 rounded-2xl px-3 py-2 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F7FF]'}`}>
                    <MapPin size={14} color="#2246C7" />
                    <Text className="text-[13px] text-[#2246C7]">Live proximity updated for {traveler.name}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
