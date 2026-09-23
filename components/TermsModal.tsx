import { X } from 'lucide-react-native';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';

// TODO: Replace with final legal copy from legal team.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. Acceptance of Terms',
    body: 'By creating a PartyUp account, you agree to these Terms and Conditions and our Privacy Policy. If you do not agree, please do not create an account or use the app.',
  },
  {
    heading: '2. Eligibility',
    body: 'You must be at least 18 years old (or the age of majority in your jurisdiction) to create an account and use PartyUp\'s trip and carpooling features.',
  },
  {
    heading: '3. User Conduct',
    body: 'You agree not to harass, discriminate against, or endanger other users, and not to use PartyUp to arrange unsafe or illegal transport. You are responsible for your own conduct during trips and meetups arranged through the app.',
  },
  {
    heading: '4. Safety Disclaimer',
    body: 'PartyUp helps travelers connect but does not own, operate, or guarantee the safety of any vehicle, driver, or trip. You participate in shared trips and travel arrangements at your own risk. Warning Mode and SOS features are best-effort safety aids, not a guarantee of safety.',
  },
  {
    heading: '5. Account Termination',
    body: 'PartyUp may suspend or terminate accounts that violate these terms, engage in fraud, or pose a safety risk to other users.',
  },
  {
    heading: '6. Changes to Terms',
    body: 'These terms may be updated from time to time. Continued use of the app after changes are posted constitutes acceptance of the updated terms.',
  },
  {
    heading: '7. Contact',
    body: 'Questions about these terms can be sent to support@partyup.app.',
  },
];

export default function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className="max-h-[80%] w-full max-w-[440px] rounded-[28px] bg-white px-5 py-6 shadow-lg shadow-black/25">
          <View className="flex-row items-center justify-between">
            <Text className="text-headline-18 font-bold text-[#273142]">Terms &amp; Conditions</Text>
            <TouchableOpacity onPress={onClose} className="h-9 w-9 items-center justify-center rounded-full bg-[#F0F1F3]">
              <X size={18} color="#697386" />
            </TouchableOpacity>
          </View>

          <ScrollView className="mt-4" showsVerticalScrollIndicator>
            {SECTIONS.map((section) => (
              <View key={section.heading} className="mb-3">
                <Text className="text-[12px] font-bold text-[#273142]">{section.heading}</Text>
                <Text className="mt-1 text-[11px] leading-4 text-[#697386]">{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} className="mt-4 items-center rounded-[8px] bg-[#2445B8] py-3">
            <Text className="text-[13px] font-bold text-white">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
