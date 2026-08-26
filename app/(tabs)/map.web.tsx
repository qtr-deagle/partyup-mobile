import { useColorScheme } from '@/hooks/use-color-scheme';
import { MapPin } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

export default function MapScreen() {
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FB]';
  const mapShellBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-black/5 bg-[#EAF0F5]';
  const primaryText = isDark ? 'text-white' : 'text-[#17233F]';
  const secondaryText = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className="px-4 pt-4">
        <View className={`h-[380px] items-center justify-center gap-3 rounded-[28px] border px-6 ${mapShellBackground}`}>
          <MapPin size={28} color="#65728B" />
          <Text className={`text-center text-[16px] font-semibold ${primaryText}`}>Map view is available on the mobile app</Text>
          <Text className={`text-center text-[14px] ${secondaryText}`}>Open PartyUp on iOS or Android to see nearby travelers on the map.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
