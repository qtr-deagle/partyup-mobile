import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { FloatingIcon, riseIn } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { Ban } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Staff suspend accounts from the website (profiles.is_active = false). The
// root layout holds suspended users here until they're reactivated.
export default function AccountSuspendedScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { screenBackground, titleColor, subtitleColor, destructiveColor } = getTheme(isDark);
  const { refreshProfile, signOut } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function checkStatus() {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }

  return (
    <View className={`flex-1 ${screenBackground}`} style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <Animated.View entering={riseIn(0, 500)} className="flex-1 items-center justify-center gap-4 px-8">
        <FloatingIcon>
          <Ban size={44} color={destructiveColor} />
        </FloatingIcon>
        <Text className={`text-center ${typography.pageTitle} ${titleColor}`}>Your account is suspended</Text>
        <Text className={`text-center text-base leading-6 ${subtitleColor}`}>
          A PartyUp admin has suspended this account, so you can't join trips, chat, or appear to other travelers for now.
        </Text>
        <Text className={`text-center text-sm leading-5 ${subtitleColor}`}>
          If you think this is a mistake, contact PartyUp support from the email you signed up with.
        </Text>

        <TouchableOpacity onPress={checkStatus} disabled={refreshing} className="mt-2 w-full items-center rounded-2xl bg-[#2A55D4] py-4">
          {refreshing ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Check Again</Text>}
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity onPress={() => setShowLogoutConfirm(true)} className="items-center py-3">
        <Text className={`text-base font-semibold ${subtitleColor}`}>Log Out</Text>
      </TouchableOpacity>

      <LogoutConfirmModal visible={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={signOut} isDark={isDark} />
    </View>
  );
}
