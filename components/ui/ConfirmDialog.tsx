import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';

export type ConfirmTone = 'danger' | 'primary' | 'success';

const TONE: Record<ConfirmTone, { button: string; ringLight: string; ringDark: string }> = {
  danger: { button: 'bg-[#E32727]', ringLight: 'bg-[#FFE1DC]', ringDark: 'bg-[#3A1B29]' },
  primary: { button: 'bg-[#284BD6]', ringLight: 'bg-[#E8EDFF]', ringDark: 'bg-[#1B2A4A]' },
  success: { button: 'bg-[#00A56A]', ringLight: 'bg-[#DDF7EA]', ringDark: 'bg-[#123326]' },
};

export type ConfirmDialogOptions = {
  /** Icon in a tinted circle, or `hero` for something custom like an avatar. */
  icon?: ReactNode;
  hero?: ReactNode;
  title: string;
  message?: ReactNode;
  tone?: ConfirmTone;
  confirmLabel: string;
  /** Omit for a one-button notice. */
  cancelLabel?: string;
  /** May be async: the button shows a spinner until it settles, then the dialog closes. */
  onConfirm?: () => unknown;
};

// The app's styled replacement for Alert.alert: centered card, rises in from
// below, big full-width buttons. Render once per screen and drive it with
// useConfirmDialog().
export function ConfirmDialog({ options, onClose, isDark }: { options: ConfirmDialogOptions | null; onClose: () => void; isDark: boolean }) {
  const [busy, setBusy] = useState(false);
  // Keep the last options while the fade-out runs, so the text doesn't blank.
  const [shown, setShown] = useState(options);
  useEffect(() => {
    if (options) {
      setShown(options);
      setBusy(false);
    }
  }, [options]);

  const tone = TONE[shown?.tone ?? 'primary'];
  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  async function handleConfirm() {
    if (!shown?.onConfirm) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await shown.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal visible={options !== null} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-5">
        {shown ? (
          <Animated.View key="confirm-card" entering={riseIn(0, 340)} className={`w-full max-w-[400px] rounded-[28px] px-5 pb-5 pt-6 shadow-lg shadow-black/25 ${card}`}>
            <View className="items-center">
              {shown.hero ?? (
                <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? tone.ringDark : tone.ringLight}`}>{shown.icon}</View>
              )}
              <Text className={`mt-4 text-center text-headline-24 font-bold leading-8 ${primary}`}>{shown.title}</Text>
              {shown.message ? (
                typeof shown.message === 'string' ? (
                  <Text className={`mt-2 text-center text-[15px] leading-6 ${secondary}`}>{shown.message}</Text>
                ) : (
                  shown.message
                )
              ) : null}
            </View>

            <TouchableOpacity onPress={() => void handleConfirm()} disabled={busy} activeOpacity={0.85} className={`mt-6 items-center rounded-2xl py-4 ${tone.button}`}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-black text-white">{shown.confirmLabel}</Text>}
            </TouchableOpacity>
            {shown.cancelLabel ? (
              <TouchableOpacity onPress={onClose} disabled={busy} activeOpacity={0.85} className={`mt-3 items-center rounded-2xl py-4 ${mutedFill}`}>
                <Text className={`text-[15px] font-bold ${primary}`}>{shown.cancelLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

/** const dialog = useConfirmDialog(); dialog.open({...}); <ConfirmDialog {...dialog.props} isDark={isDark} /> */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  return {
    open: setOptions,
    close: () => setOptions(null),
    props: { options, onClose: () => setOptions(null) },
  };
}
