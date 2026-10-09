import { riseIn } from '@/components/ui/motion';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { submitUserRating } from '@/lib/ratings';
import { feedback } from '@/lib/sounds';
import { Image } from 'expo-image';
import { Star, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ReviewTarget = { userId: string; displayName: string; avatarUrl: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  tripId: string;
  tripTitle: string;
  members: ReviewTarget[];
  onRated: (userId: string, rating: number, comment: string | null) => void;
};

// Post-trip prompt that walks through each companion one at a time. Every
// step is optional: Skip moves on without submitting, X dismisses the rest.
export function TripReviewsModal({ visible, onClose, isDark, tripId, tripTitle, members, onRated }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ratedAny, setRatedAny] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setRatedAny(false);
    }
  }, [visible]);

  useEffect(() => {
    setRating(0);
    setComment('');
    setErrorMessage(null);
  }, [step]);

  const sheetBackground = isDark ? '#111B2E' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#0B1220' : '#FBFCFE';

  const current = members[step];

  // Stars or a comment on the current companion: ask before closing.
  function handleClose() {
    if (submitting) return;
    confirmDiscard(rating > 0 || !!comment.trim(), onClose, { message: "This rating isn't submitted yet. Close anyway?" });
  }

  function advance(didRate: boolean) {
    if (step + 1 >= members.length) {
      if (didRate || ratedAny) {
        feedback.success();
      }
      onClose();
      return;
    }
    setStep(step + 1);
  }

  async function handleSubmit() {
    if (!current || rating < 1) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await submitUserRating(current.userId, tripId, rating, comment);
    setSubmitting(false);
    if (error) {
      feedback.error();
      setErrorMessage(error.message);
      return;
    }
    onRated(current.userId, rating, comment.trim() || null);
    setRatedAny(true);
    advance(true);
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/55" onPress={handleClose}>
          {visible && current ? (
            <Animated.View
              key="trip-reviews-sheet"
              entering={riseIn(0, 360)}
              className="px-5 pt-5"
              style={{ paddingBottom: insets.bottom + 24, backgroundColor: sheetBackground, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
            >
              {/* Swallow taps so only the backdrop closes the sheet. */}
              <Pressable onPress={() => undefined}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-headline-20 font-bold" style={{ color: primaryText }} numberOfLines={2}>
                      How was {tripTitle}?
                    </Text>
                    <Text className="mt-1 text-sm" style={{ color: mutedText }}>
                      Review your companions — totally optional · {step + 1} of {members.length}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: closeButtonBg }}>
                    <X size={18} color={mutedText} />
                  </TouchableOpacity>
                </View>

                <View className="mt-3 flex-row gap-1.5">
                  {members.map((member, index) => (
                    <View key={member.userId} className="h-1 flex-1 rounded-full" style={{ backgroundColor: index <= step ? '#2A55D4' : border }} />
                  ))}
                </View>

                <View key={current.userId} className="mt-5 items-center">
                  {current.avatarUrl ? (
                    <Image source={{ uri: current.avatarUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} transition={200} />
                  ) : (
                    <View className="items-center justify-center bg-[#B7C4EC]" style={{ width: 72, height: 72, borderRadius: 36 }}>
                      <Text className="text-[28px] font-bold text-[#24314A]">{current.displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text className="mt-2 text-lg font-bold" style={{ color: primaryText }}>
                    {current.displayName}
                  </Text>

                  <View className="mt-4 flex-row items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => {
                          feedback.select();
                          setRating(value);
                        }}
                        accessibilityLabel={`${value} stars`}
                      >
                        <Star size={36} color="#F5A623" fill={value <= rating ? '#F5A623' : 'transparent'} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {errorMessage ? (
                  <View className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                    <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
                  </View>
                ) : null}

                <TextInput
                  className="mt-5 min-h-[72px] rounded-2xl border px-4 py-3.5 text-base"
                  style={{ borderColor: border, backgroundColor: inputBg, color: primaryText, textAlignVertical: 'top' }}
                  placeholder={`How was traveling with ${current.displayName}? (optional)`}
                  placeholderTextColor={mutedText}
                  multiline
                  value={comment}
                  onChangeText={setComment}
                />

                <Text className="mt-4 text-center text-[12px]" style={{ color: mutedText }}>
                  Ratings are final and can&apos;t be changed after you submit.
                </Text>

                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity onPress={() => advance(false)} disabled={submitting} className="flex-1 items-center rounded-2xl border py-4" style={{ borderColor: border }}>
                    <Text className="text-base font-bold" style={{ color: mutedText }}>
                      Skip
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleSubmit()}
                    disabled={submitting || rating < 1}
                    className="flex-[2] items-center rounded-2xl bg-[#2A55D4] py-4"
                    style={{ opacity: rating < 1 ? 0.5 : 1 }}
                  >
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-base font-bold text-white">{step + 1 >= members.length ? 'Submit' : 'Submit & next'}</Text>}
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
