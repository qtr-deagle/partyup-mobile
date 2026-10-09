import { useAuth } from '@/hooks/auth-provider';
import { PHONE_INVALID_MESSAGE, formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';
import { feedback } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Asks travelers who signed up before mobile numbers were required to add
// one. Trips stay blocked until they do (the database checks it on create,
// join and seat requests), so "Later" only closes this for now.
export default function PhoneRequiredModal({ visible, onClose, isDark }: { visible: boolean; onClose: () => void; isDark: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';
  const inputBox = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#DCE3EF] bg-[#F4F6FA]';

  useEffect(() => {
    if (visible) {
      setPhone('');
      setError(null);
    }
  }, [visible]);

  async function handleSave() {
    if (!profile) return;
    if (!isValidPhone(phone)) {
      setError(PHONE_INVALID_MESSAGE);
      feedback.error();
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('profiles').update({ phone }).eq('id', profile.id);
    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      feedback.error();
      return;
    }
    await refreshProfile();
    setSaving(false);
    feedback.success();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onClose}>
      <KeyboardAvoidingView behavior="padding" className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className={`w-full max-w-[400px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <View className="items-center">
            <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? 'bg-[#1B2B4D]' : 'bg-[#E9EEFF]'}`}>
              <Phone size={28} color="#2A55D4" />
            </View>
            <Text className={`mt-4 text-center text-headline-24 font-bold ${primary}`}>Add your mobile number</Text>
            <Text className={`mt-2 text-center text-[15px] leading-6 ${secondary}`}>
              It&apos;s now required to create or join trips, so the safety team can call you if you send an SOS. Only your trusted circle and the PartyUp safety team can see it.
            </Text>
          </View>

          <TextInput
            value={formatPhone(phone)}
            onChangeText={(text) => setPhone(normalizePhone(text))}
            keyboardType="phone-pad"
            maxLength={13}
            autoFocus
            placeholder="0917 123 4567"
            placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
            className={`mt-5 rounded-xl border px-4 py-3 text-center text-[17px] font-semibold tracking-wide ${inputBox} ${primary}`}
          />
          {error ? <Text className="mt-2 text-[13px] text-[#E32727]">{error}</Text> : null}

          <TouchableOpacity onPress={() => void handleSave()} disabled={saving} className="mt-5 items-center rounded-2xl bg-[#2A55D4] py-4">
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">Save number</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={saving} className={`mt-3 items-center rounded-2xl py-4 ${mutedFill}`}>
            <Text className={`font-bold ${primary}`}>Later</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
