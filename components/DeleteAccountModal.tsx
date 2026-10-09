import { AlertCircle, Check, Frown } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import LegalModal from '@/components/LegalModal';
import { riseIn } from '@/components/ui/motion';
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/constants/legal';
import { getDeletionBlockers, requestAccountDeletion, type DeletionBlocker } from '@/lib/accountDeletion';

const ACKNOWLEDGEMENTS = [
  'privacy',
  `I understand that my profile, trips, chats, verification documents and guild progress will be permanently deleted after ${ACCOUNT_DELETION_GRACE_DAYS} days`,
  'I understand that I forfeit my guild points, ranks, cosmetics and rewards, and completed payments will not be refunded',
] as const;

export default function DeleteAccountModal({
  visible,
  onClose,
  onDeleted,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the scheduled deletion date once the request succeeds. */
  onDeleted: (scheduledFor: string | null) => Promise<void>;
  isDark: boolean;
}) {
  const [checked, setChecked] = useState<boolean[]>(ACKNOWLEDGEMENTS.map(() => false));
  const [blockers, setBlockers] = useState<DeletionBlocker[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const rowFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';
  const divider = isDark ? 'bg-[#22324B]' : 'bg-[#E4E7EE]';

  // Fresh checkboxes and a fresh blocker check every time it opens.
  async function handleShow() {
    setChecked(ACKNOWLEDGEMENTS.map(() => false));
    setBlockers(null);
    setErrorMessage(null);
    setDeleting(false);
    setLoadFailed(false);
    const { data, error } = await getDeletionBlockers();
    if (error) {
      // Don't treat a failed check as "nothing blocking": keep delete disabled.
      setErrorMessage(`Couldn't check your account right now. Close this and try again. (${error.message})`);
      setBlockers(null);
      setLoadFailed(true);
      return;
    }
    setBlockers(data);
  }

  const checking = blockers === null && !loadFailed;
  const blocked = (blockers?.length ?? 0) > 0;
  const allChecked = checked.every(Boolean);
  const canDelete = !checking && !loadFailed && !blocked && allChecked && !deleting;

  async function handleDelete() {
    setDeleting(true);
    setErrorMessage(null);
    const { data, error } = await requestAccountDeletion();
    if (error) {
      setErrorMessage(error.message);
      setDeleting(false);
      return;
    }
    await onDeleted(data);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={() => void handleShow()}
      onRequestClose={deleting ? undefined : onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <Animated.View
          entering={riseIn(0, 380)}
          className={`max-h-[88%] w-full max-w-[440px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <Text className={`text-headline-24 font-bold leading-8 ${primary}`}>Are you sure you want to delete your account?</Text>
              </View>
              <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? 'bg-[#3A1B29]' : 'bg-[#FFE1DC]'}`}>
                <Frown size={30} color="#E32727" />
              </View>
            </View>

            {checking ? (
              <View className="items-center py-10">
                <ActivityIndicator color={isDark ? '#94A3B8' : '#2445B8'} />
              </View>
            ) : loadFailed ? null : blocked ? (
              <>
                <Text className={`mt-3 text-[15px] leading-6 ${secondary}`}>
                  Your account can&apos;t be deleted yet, because other people still depend on it.{' '}
                  <Text className={`font-bold ${primary}`}>Resolve these first:</Text>
                </Text>
                <View className="mt-4 gap-2.5">
                  {blockers!.map((blocker) => (
                    <View key={`${blocker.kind}-${blocker.ref_id}`} className={`flex-row items-start gap-3 rounded-2xl px-4 py-3.5 ${rowFill}`}>
                      <AlertCircle size={18} color="#E5A00D" style={{ marginTop: 1 }} />
                      <Text className={`flex-1 text-[14px] leading-5 ${primary}`}>{blocker.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text className={`mt-3 text-[15px] leading-6 ${secondary}`}>
                  Your account will be deactivated now and permanently deleted in {ACCOUNT_DELETION_GRACE_DAYS} days. To continue,{' '}
                  <Text className={`font-bold ${primary}`}>confirm the information below.</Text>
                </Text>
                <View className="mt-4 gap-2.5">
                  {ACKNOWLEDGEMENTS.map((text, index) => (
                    <TouchableOpacity
                      key={text}
                      activeOpacity={0.8}
                      disabled={deleting}
                      onPress={() => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))}>
                      <View className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 ${rowFill}`}>
                        <View
                          className={`h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] ${
                            checked[index] ? 'border-[#E32727] bg-[#E32727]' : isDark ? 'border-[#475569] bg-[#111B2E]' : 'border-[#B4BCC8] bg-white'
                          }`}>
                          {checked[index] ? <Check size={14} color="#FFFFFF" /> : null}
                        </View>
                        {text === 'privacy' ? (
                          <Text className={`flex-1 text-[14px] leading-5 ${primary}`}>
                            I accept the terms of account deletion as described in the{' '}
                            <Text className="font-bold text-[#2445B8] underline" onPress={() => setShowPrivacy(true)}>
                              Privacy Policy
                            </Text>
                          </Text>
                        ) : (
                          <Text className={`flex-1 text-[14px] leading-5 ${primary}`}>{text}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {errorMessage ? (
              <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-[#FFF1F3] px-4 py-3">
                <AlertCircle size={16} color="#E11D48" style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[13px] leading-5 text-[#BE123C]">{errorMessage}</Text>
              </View>
            ) : null}

            <View className={`mt-5 h-px ${divider}`} />

            <View className="mt-5 flex-row gap-3">
              <TouchableOpacity onPress={onClose} disabled={deleting} className="flex-1">
                <View className={`items-center rounded-full border-[1.5px] py-3.5 ${isDark ? 'border-[#475569]' : 'border-[#182847]'}`}>
                  <Text className={`font-bold ${primary}`}>{blocked ? 'Close' : 'Nevermind'}</Text>
                </View>
              </TouchableOpacity>
              {blocked ? null : (
                <TouchableOpacity onPress={() => void handleDelete()} disabled={!canDelete} className="flex-[1.4]">
                  <View className={`items-center rounded-full py-3.5 ${canDelete || deleting ? 'bg-[#E32727]' : isDark ? 'bg-[#4A2530]' : 'bg-[#F4B4B4]'}`}>
                    {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">Delete my account</Text>}
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </Animated.View>

        <LegalModal visible={showPrivacy} doc="privacy" isDark={isDark} onClose={() => setShowPrivacy(false)} />
      </View>
    </Modal>
  );
}
