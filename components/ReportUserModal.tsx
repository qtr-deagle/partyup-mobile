import { MAX_REPORT_EVIDENCE_PHOTOS, REPORT_TYPES, REPORT_TYPE_LABELS, submitReport, type ReportType } from '@/lib/reports';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  reportedUserId?: string;
  tripId?: string;
  targetDisplayName: string;
};

export function ReportUserModal({ visible, onClose, isDark, reportedUserId, tripId, targetDisplayName }: Props) {
  const [reportType, setReportType] = useState<ReportType>('behavior');
  const [details, setDetails] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#111B2E' : '#FBFCFE';

  function reset() {
    setReportType('behavior');
    setDetails('');
    setEvidenceUris([]);
    setErrorMessage(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePickImages() {
    const remaining = MAX_REPORT_EVIDENCE_PHOTOS - evidenceUris.length;
    if (remaining <= 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo library access is needed to attach evidence.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;

    setEvidenceUris((prev) => [...prev, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_REPORT_EVIDENCE_PHOTOS));
  }

  function handleRemoveImage(uri: string) {
    setEvidenceUris((prev) => prev.filter((existing) => existing !== uri));
  }

  async function handleSubmit() {
    if (!details.trim()) {
      setErrorMessage('Please describe what happened.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await submitReport({ reportedUserId, tripId, reportType, details, evidenceUris });
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    Alert.alert('Report submitted', 'Thanks for letting us know. Our team will review this.');
    handleClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} className="bg-black/55" onPress={handleClose} />
        <View style={{ backgroundColor: sheetBackground }} className="rounded-t-[32px] px-5 pb-9 pt-5 shadow-2xl">
          <View className="flex-row items-center justify-between">
            <Text className="text-headline-24 font-bold" style={{ color: primaryText }}>
              Report {targetDisplayName}
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

          <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
            REASON
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {REPORT_TYPES.map((type) => {
              const selected = reportType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setReportType(type)}
                  className="rounded-full border px-4 py-2"
                  style={{ borderColor: selected ? '#2A55D4' : border, backgroundColor: selected ? '#2A55D4' : inputBg }}
                >
                  <Text className="text-sm font-bold" style={{ color: selected ? '#FFFFFF' : primaryText }}>
                    {REPORT_TYPE_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
            WHAT HAPPENED
          </Text>
          <TextInput
            className="mt-2 min-h-[96px] rounded-2xl border px-4 py-3.5 text-base"
            style={{ borderColor: border, backgroundColor: inputBg, color: primaryText }}
            placeholder="Describe the issue..."
            placeholderTextColor={mutedText}
            multiline
            value={details}
            onChangeText={setDetails}
          />

          <View className="mt-5 flex-row items-center justify-between">
            <Text className="text-[13px] font-bold" style={{ color: mutedText }}>
              ADD PHOTOS (OPTIONAL)
            </Text>
            <Text className="text-xs" style={{ color: mutedText }}>
              {evidenceUris.length}/{MAX_REPORT_EVIDENCE_PHOTOS}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            <View className="flex-row gap-2">
              {evidenceUris.map((uri) => (
                <View key={uri} className="relative">
                  <Image source={{ uri }} className="h-16 w-16 rounded-xl" />
                  <TouchableOpacity
                    onPress={() => handleRemoveImage(uri)}
                    accessibilityLabel="Remove photo"
                    className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-black/70"
                  >
                    <X size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
              {evidenceUris.length < MAX_REPORT_EVIDENCE_PHOTOS && (
                <TouchableOpacity
                  onPress={handlePickImages}
                  className="h-16 w-16 items-center justify-center rounded-xl border border-dashed"
                  style={{ borderColor: border, backgroundColor: inputBg }}
                >
                  <ImagePlus size={20} color={mutedText} />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity onPress={handleSubmit} disabled={submitting} className="mt-5 rounded-2xl bg-[#E32727] py-4">
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Submit Report</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
