import { LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';

export default function LogoutConfirmModal({
  visible,
  onClose,
  onConfirm,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDark: boolean;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  useEffect(() => {
    if (visible) setLoggingOut(false);
  }, [visible]);

  async function handleConfirm() {
    setLoggingOut(true);
    try {
      await onConfirm();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={loggingOut ? undefined : onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className={`w-full max-w-[400px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <View className="items-center">
            <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? 'bg-[#3A1B29]' : 'bg-[#FFE1DC]'}`}>
              <LogOut size={28} color="#E32727" />
            </View>
            <Text className={`mt-4 text-center text-headline-24 font-bold ${primary}`}>Log out?</Text>
            <Text className={`mt-2 text-center text-[15px] leading-6 ${secondary}`}>
              You&apos;ll need to log in again to join trips, chat with your buddies, and use safety features.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => void handleConfirm()}
            disabled={loggingOut}
            className="mt-6 items-center rounded-2xl bg-[#E32727] py-4">
            {loggingOut ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">Log Out</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={loggingOut} className={`mt-3 items-center rounded-2xl py-4 ${mutedFill}`}>
            <Text className={`font-bold ${primary}`}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
