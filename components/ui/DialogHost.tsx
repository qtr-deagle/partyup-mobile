import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { pressDialogButton, useCurrentDialog, type DialogButton, type DialogEntry, type DialogTone } from '@/lib/dialog';

const TONES: Record<DialogTone, { color: string; fill: string; ringLight: string; ringDark: string; Icon: typeof Info }> = {
  danger: { color: '#E32727', fill: 'bg-[#E32727]', ringLight: 'bg-[#FFE1DC]', ringDark: 'bg-[#3A1B29]', Icon: AlertTriangle },
  error: { color: '#E11D48', fill: 'bg-[#284BD6]', ringLight: 'bg-[#FFE4E9]', ringDark: 'bg-[#3A1B29]', Icon: AlertCircle },
  success: { color: '#00A56A', fill: 'bg-[#00A56A]', ringLight: 'bg-[#DDF7EA]', ringDark: 'bg-[#123326]', Icon: CheckCircle2 },
  info: { color: '#284BD6', fill: 'bg-[#284BD6]', ringLight: 'bg-[#E8EDFF]', ringDark: 'bg-[#1B2A4A]', Icon: Info },
};

// Renders lib/dialog's showAlert() calls as the app's styled card. Mounted
// once at the root; a queue shows dialogs one after another.
export default function DialogHost() {
  const current = useCurrentDialog();
  const isDark = useColorScheme() === 'dark';
  // Keep the last dialog while the modal fades out so it doesn't blank.
  const [shown, setShown] = useState<DialogEntry | null>(current);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';
  const softFill = isDark ? 'bg-[#1B2A4A]' : 'bg-[#EEF2FF]';

  function handleBack() {
    if (!current) return;
    const cancel = current.buttons.find((button) => button.style === 'cancel');
    if (cancel) pressDialogButton(current, cancel);
    else if (current.buttons.length <= 1 || current.options.cancelable) pressDialogButton(current, current.buttons.length === 1 ? current.buttons[0] : null);
  }

  const entry = current ?? shown;
  const tone = entry ? TONES[entry.tone] : TONES.info;
  const cancelButtons = entry?.buttons.filter((button) => button.style === 'cancel') ?? [];
  const actionButtons = entry?.buttons.filter((button) => button.style !== 'cancel') ?? [];

  function actionClass(button: DialogButton, index: number) {
    if (button.style === 'destructive') return 'bg-[#E32727]';
    // With several choices only the first is filled; the rest are softer.
    return index === 0 ? tone.fill : softFill;
  }

  function actionText(button: DialogButton, index: number) {
    if (button.style === 'destructive' || index === 0) return 'text-white';
    return isDark ? 'text-[#C7D2FE]' : 'text-[#284BD6]';
  }

  return (
    <Modal visible={current !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={handleBack}>
      <View className="flex-1 items-center justify-center bg-black/45 px-5">
        {entry ? (
          <Animated.View
            key={`dialog-${entry.id}`}
            entering={riseIn(0, 340)}
            className={`max-h-[85%] w-full max-w-[400px] rounded-[28px] px-5 pb-5 pt-6 shadow-lg shadow-black/25 ${card}`}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View className="items-center">
                {entry.options.hero ?? (
                  <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? tone.ringDark : tone.ringLight}`}>
                    <tone.Icon size={28} color={tone.color} />
                  </View>
                )}
                <Text className={`mt-4 text-center text-[21px] font-bold leading-7 ${primary}`}>{entry.title}</Text>
                {entry.message ? <Text className={`mt-2 text-center text-[15px] leading-6 ${secondary}`}>{entry.message}</Text> : null}
              </View>

              <View className="mt-6 gap-3">
                {actionButtons.map((button, index) => (
                  <TouchableOpacity
                    key={`action-${index}`}
                    onPress={() => current && pressDialogButton(current, button)}
                    activeOpacity={0.85}
                    className={`items-center rounded-2xl py-4 ${actionClass(button, index)}`}>
                    <Text className={`text-[15px] font-black ${actionText(button, index)}`}>{button.text ?? 'OK'}</Text>
                  </TouchableOpacity>
                ))}
                {cancelButtons.map((button, index) => (
                  <TouchableOpacity
                    key={`cancel-${index}`}
                    onPress={() => current && pressDialogButton(current, button)}
                    activeOpacity={0.85}
                    className={`items-center rounded-2xl py-4 ${mutedFill}`}>
                    <Text className={`text-[15px] font-bold ${primary}`}>{button.text ?? 'Cancel'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
