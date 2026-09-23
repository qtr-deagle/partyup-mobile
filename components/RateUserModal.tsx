import { submitUserRating } from '@/lib/ratings';
import { Star, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  targetUserId: string;
  tripId: string;
  targetDisplayName: string;
  initialRating?: number;
  initialComment?: string | null;
  onSubmitted: (rating: number, comment: string | null) => void;
};

export function RateUserModal({ visible, onClose, isDark, targetUserId, tripId, targetDisplayName, initialRating, initialComment, onSubmitted }: Props) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [comment, setComment] = useState(initialComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#111B2E' : '#FBFCFE';

  function handleClose() {
    setErrorMessage(null);
    onClose();
  }

  async function handleSubmit() {
    if (rating < 1) {
      setErrorMessage('Please select a star rating.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await submitUserRating(targetUserId, tripId, rating, comment);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    onSubmitted(rating, comment.trim() || null);
    handleClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} className="bg-black/55" onPress={handleClose} />
        <View style={{ backgroundColor: sheetBackground }} className="rounded-t-[32px] px-5 pb-9 pt-5 shadow-2xl">
          <View className="flex-row items-center justify-between">
            <Text className="text-headline-24 font-bold" style={{ color: primaryText }}>
              Rate {targetDisplayName}
            </Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: closeButtonBg }}>
              <X size={18} color={mutedText} />
            </TouchableOpacity>
          </View>

          {errorMessage ? (
            <View className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          <View className="mt-5 flex-row items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity key={value} onPress={() => setRating(value)} accessibilityLabel={`${value} stars`}>
                <Star size={36} color="#F5A623" fill={value <= rating ? '#F5A623' : 'transparent'} />
              </TouchableOpacity>
            ))}
          </View>

          <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
            COMMENT (OPTIONAL)
          </Text>
          <TextInput
            className="mt-2 min-h-[80px] rounded-2xl border px-4 py-3.5 text-base"
            style={{ borderColor: border, backgroundColor: inputBg, color: primaryText }}
            placeholder="How was traveling with them?"
            placeholderTextColor={mutedText}
            multiline
            value={comment}
            onChangeText={setComment}
          />

          <TouchableOpacity onPress={handleSubmit} disabled={submitting} className="mt-5 rounded-2xl bg-[#2A55D4] py-4">
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Submit Rating</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
