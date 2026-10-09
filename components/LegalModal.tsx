import { X } from 'lucide-react-native';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';
import { LEGAL_LAST_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/constants/legal';

export type LegalDoc = 'terms' | 'privacy';

const DOCS = {
  terms: { title: 'Terms & Conditions', sections: TERMS_SECTIONS },
  privacy: { title: 'Privacy Policy', sections: PRIVACY_SECTIONS },
} as const;

export default function LegalModal({
  visible,
  onClose,
  doc,
  isDark = false,
}: {
  visible: boolean;
  onClose: () => void;
  doc: LegalDoc;
  isDark?: boolean;
}) {
  const { title, sections } = DOCS[doc];
  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#273142]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#697386]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F0F1F3]';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <Animated.View
          entering={riseIn(0, 380)}
          className={`max-h-[80%] w-full max-w-[440px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className={`text-headline-18 font-bold ${primary}`}>{title}</Text>
              <Text className={`mt-0.5 text-[11px] ${secondary}`}>Last updated {LEGAL_LAST_UPDATED}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className={`h-9 w-9 items-center justify-center rounded-full ${mutedFill}`}>
              <X size={18} color={isDark ? '#94A3B8' : '#697386'} />
            </TouchableOpacity>
          </View>

          <ScrollView className="mt-4" showsVerticalScrollIndicator>
            {sections.map((section) => (
              <View key={section.heading} className="mb-3">
                <Text className={`text-[12px] font-bold ${primary}`}>{section.heading}</Text>
                <Text className={`mt-1 text-[11px] leading-4 ${secondary}`}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} className="mt-4 items-center rounded-[8px] bg-[#2445B8] py-3">
            <Text className="text-[13px] font-bold text-white">Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
