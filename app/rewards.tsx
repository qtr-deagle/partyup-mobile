import { RewardsPanel } from '@/components/guild/RewardsPanel';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme } from '@/lib/theme';
import { View } from 'react-native';

// Standalone route kept for notification deep links; the same panel is the
// Guild screen's Rewards tab.
export default function RewardsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { screenBackground } = getTheme(isDark);
  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader title="Rewards" subtitle="Spend the coins you earn in your guild" />
      <RewardsPanel />
    </View>
  );
}
