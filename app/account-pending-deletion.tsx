import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { FloatingIcon, riseIn } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cancelAccountDeletion, formatDeletionDate } from '@/lib/accountDeletion';
import { getTheme, typography } from '@/lib/theme';
import { AlertCircle, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The user asked to delete their account (request_account_deletion). It stays
// deactivated for 30 days before it's purged; the root layout holds them here
// until they restore it or sign out.
export default function AccountPendingDeletionScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { screenBackground, titleColor, subtitleColor, destructiveColor } = getTheme(isDark);
  const { profile, refreshProfile, signOut } = useAuth();

  const [restoring, setRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function restore() {
    setRestoring(true);
    setErrorMessage(null);
    const { error } = await cancelAccountDeletion();
    if (error) {
      setErrorMessage(error.message);
    } else {
      await refreshProfile();
    }
    setRestoring(false);
  }

  return (
    <View className={`flex-1 ${screenBackground}`} style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <Animated.View entering={riseIn(0, 500)} className="flex-1 items-center justify-center gap-4 px-8">
        <FloatingIcon>
          <Trash2 size={44} color={destructiveColor} />
        </FloatingIcon>
        <Text className={`text-center ${typography.pageTitle} ${titleColor}`}>Your account is scheduled for deletion</Text>
        <Text className={`text-center text-base leading-6 ${subtitleColor}`}>
          It will be permanently deleted on{' '}
          <Text className={`font-bold ${titleColor}`}>{formatDeletionDate(profile?.deletion_scheduled_for)}</Text>. Until then it&apos;s
          hidden from other travelers.
        </Text>
        <Text className={`text-center text-sm leading-5 ${subtitleColor}`}>
          Changed your mind? Restore it now and everything will be just as you left it.
        </Text>

        {errorMessage ? (
          <View className="w-full flex-row items-start gap-2 rounded-2xl bg-[#FFF1F3] px-4 py-3">
            <AlertCircle size={16} color="#E11D48" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[13px] leading-5 text-[#BE123C]">{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={() => void restore()} disabled={restoring} className="mt-2 w-full items-center rounded-2xl bg-[#2A55D4] py-4">
          {restoring ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Restore My Account</Text>}
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity onPress={() => setShowLogoutConfirm(true)} className="items-center py-3">
        <Text className={`text-base font-semibold ${subtitleColor}`}>Log Out</Text>
      </TouchableOpacity>

      <LogoutConfirmModal visible={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={signOut} isDark={isDark} />
    </View>
  );
}
