import {
  GUILD_REPORT_CATEGORIES,
  GUILD_REPORT_CATEGORY_LABELS,
  MAX_GUILD_REPORT_PHOTOS,
  submitGuildReport,
  type GuildReportCategory,
} from '@/lib/guildReports';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Crown, ImagePlus, ShieldAlert, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ReportableMember = { user_id: string; display_name: string; is_leader?: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  guildId: string;
  guildName?: string;
  myUserId?: string;
  // Offered in the "About" picker; the caller is left out.
  members: ReportableMember[];
  // Opens with this member picked (from their row in the member list).
  initialMemberId?: string | null;
  // Reporting one guild chat message; the sender is implied.
  chatMessage?: { id: string; preview: string; senderName: string } | null;
};

// A member reports a problem inside their guild. The Guild Leader gets it;
// reports about the leader, and safety reports, also go to admins.
export function GuildReportModal({ visible, onClose, isDark, guildId, guildName, myUserId, members, initialMemberId, chatMessage }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<GuildReportCategory>('behavior');
  const [memberId, setMemberId] = useState<string | null>(initialMemberId ?? null);
  const [details, setDetails] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pick up the preselected member each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setMemberId(initialMemberId ?? null);
  }

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#111B2E' : '#FBFCFE';

  const others = members.filter((member) => member.user_id !== myUserId);
  const aboutLeader = !chatMessage && !!others.find((member) => member.user_id === memberId)?.is_leader;

  function reset() {
    setCategory('behavior');
    setMemberId(null);
    setDetails('');
    setEvidenceUris([]);
    setAnonymous(false);
    setErrorMessage(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePickImages() {
    const remaining = MAX_GUILD_REPORT_PHOTOS - evidenceUris.length;
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

    setEvidenceUris((prev) => [...prev, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_GUILD_REPORT_PHOTOS));
  }

  async function handleSubmit() {
    if (!details.trim()) {
      setErrorMessage('Please describe what happened.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { data, error } = await submitGuildReport({
      guildId,
      category,
      details,
      reportedUserId: chatMessage ? null : memberId,
      chatMessageId: chatMessage?.id ?? null,
      evidenceUris,
      anonymous,
    });
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    Alert.alert(
      'Report sent',
      data?.escalation_reason === 'safety'
        ? 'Your Guild Leader and the PartyUp team were both alerted.'
        : "Your Guild Leader will review it. We'll let you know when it's handled."
    );
    handleClose();
  }

  // The leader handles guild reports, so a problem with them becomes a
  // support ticket for the PartyUp team instead.
  function reportLeader() {
    const leader = others.find((member) => member.user_id === memberId);
    if (!leader) return;
    handleClose();
    router.push({
      pathname: '/support/new',
      params: { category: 'guild_leader', userId: leader.user_id, userName: leader.display_name, guildId, guildName: guildName ?? '' },
    });
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={handleClose} />
        <View style={{ backgroundColor: sheetBackground, paddingBottom: insets.bottom + 24, maxHeight: '90%' }} className="rounded-t-[32px] px-5 pt-5 shadow-2xl">
          <View className="flex-row items-center justify-between">
            <Text className="text-headline-24 font-bold" style={{ color: primaryText }}>
              {chatMessage ? 'Report message' : 'Report a problem'}
            </Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: closeButtonBg }}>
              <X size={18} color={mutedText} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {errorMessage ? (
              <View className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
              </View>
            ) : null}

            {chatMessage ? (
              <View className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                <Text className="text-xs font-bold" style={{ color: mutedText }}>
                  {chatMessage.senderName}
                </Text>
                <Text className="mt-0.5 text-sm" style={{ color: primaryText }} numberOfLines={3}>
                  {chatMessage.preview}
                </Text>
              </View>
            ) : (
              <>
                <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
                  ABOUT
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                  <View className="flex-row gap-2">
                    {[{ user_id: '', display_name: 'Nobody specific' }, ...others].map((member) => {
                      const id = member.user_id || null;
                      const selected = memberId === id;
                      return (
                        <TouchableOpacity
                          key={member.user_id || 'none'}
                          onPress={() => setMemberId(id)}
                          className="rounded-full border px-4 py-2"
                          style={{ borderColor: selected ? '#2A55D4' : border, backgroundColor: selected ? '#2A55D4' : inputBg }}>
                          <Text className="text-sm font-bold" style={{ color: selected ? '#FFFFFF' : primaryText }}>
                            {member.display_name}
                            {'is_leader' in member && member.is_leader ? ' (Leader)' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {aboutLeader ? (
              <View key="leader" className="mt-5 rounded-2xl border px-4 py-4" style={{ borderColor: border, backgroundColor: inputBg }}>
                <View className="flex-row items-center gap-2">
                  <Crown size={16} color="#D88700" />
                  <Text className="flex-1 text-sm font-bold" style={{ color: primaryText }}>
                    Problems with the Guild Leader go to PartyUp
                  </Text>
                </View>
                <Text className="mt-1 text-xs" style={{ color: mutedText }}>
                  Your leader handles guild reports, so we take these ourselves. Send a ticket to the PartyUp team. Your guild won&apos;t see it.
                </Text>
                <TouchableOpacity onPress={reportLeader} className="mt-4 rounded-2xl bg-[#E32727] py-3.5">
                  <Text className="text-center text-base font-bold text-white">Report to PartyUp</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View key="form">
              <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
                REASON
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {GUILD_REPORT_CATEGORIES.map((type) => {
                  const selected = category === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setCategory(type)}
                      className="rounded-full border px-4 py-2"
                      style={{ borderColor: selected ? '#2A55D4' : border, backgroundColor: selected ? '#2A55D4' : inputBg }}>
                      <Text className="text-sm font-bold" style={{ color: selected ? '#FFFFFF' : primaryText }}>
                        {GUILD_REPORT_CATEGORY_LABELS[type]}
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
                maxLength={2000}
                value={details}
                onChangeText={setDetails}
              />

              <View className="mt-5 flex-row items-center justify-between">
                <Text className="text-[13px] font-bold" style={{ color: mutedText }}>
                  ADD PHOTOS (OPTIONAL)
                </Text>
                <Text className="text-xs" style={{ color: mutedText }}>
                  {evidenceUris.length}/{MAX_GUILD_REPORT_PHOTOS}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                <View className="flex-row gap-2">
                  {evidenceUris.map((uri) => (
                    <View key={uri} className="relative">
                      <Image source={{ uri }} className="h-16 w-16 rounded-xl" />
                      <TouchableOpacity
                        onPress={() => setEvidenceUris((prev) => prev.filter((existing) => existing !== uri))}
                        accessibilityLabel="Remove photo"
                        className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-black/70">
                        <X size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {evidenceUris.length < MAX_GUILD_REPORT_PHOTOS && (
                    <TouchableOpacity
                      onPress={handlePickImages}
                      className="h-16 w-16 items-center justify-center rounded-xl border border-dashed"
                      style={{ borderColor: border, backgroundColor: inputBg }}>
                      <ImagePlus size={20} color={mutedText} />
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>

              <View className="mt-5 flex-row items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                <View className="flex-1">
                  <Text className="text-sm font-bold" style={{ color: primaryText }}>
                    Report anonymously
                  </Text>
                  <Text className="text-xs" style={{ color: mutedText }}>
                    Your Guild Leader won&apos;t see your name. PartyUp admins always can.
                  </Text>
                </View>
                <Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ true: '#2A55D4' }} />
              </View>

              <View className="mt-3 flex-row items-start gap-2">
                <ShieldAlert size={14} color={mutedText} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-xs" style={{ color: mutedText }}>
                  Safety reports also go to PartyUp admins, and so does anything your leader doesn&apos;t handle in 72 hours. A problem with the Guild Leader? Pick them above.
                </Text>
              </View>

              <TouchableOpacity onPress={handleSubmit} disabled={submitting} className="mt-5 rounded-2xl bg-[#E32727] py-4">
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Submit Report</Text>}
              </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
