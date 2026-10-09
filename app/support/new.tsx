import { DraftBanner } from '@/components/ui/DraftBanner';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useDraft, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSupportTicket, MAX_TICKET_PHOTOS, TICKET_CATEGORIES, TICKET_CATEGORY_LABELS, type TicketCategory } from '@/lib/support';
import { getTheme } from '@/lib/theme';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Crown, ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Params = {
  category?: string;
  // Guild Leader reports: who and which guild, plus the reported chat message.
  userId?: string;
  userName?: string;
  guildId?: string;
  guildName?: string;
  excerpt?: string;
};

// Opens a support ticket. From the guild screens it arrives preset as a
// report about the member's Guild Leader.
export default function NewTicketScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { screenBackground } = getTheme(isDark);

  const aboutLeader = params.category === 'guild_leader' && !!params.userId;
  const initialSubject = aboutLeader ? `Problem with my Guild Leader${params.userName ? `, ${params.userName}` : ''}` : '';
  const initialBody = params.excerpt ? `Reported guild chat message: "${params.excerpt}"\n\n` : '';
  const [category, setCategory] = useState<TicketCategory>(aboutLeader ? 'guild_leader' : 'other');
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Unsaved work: warn on leave; plain tickets also keep a draft (leader
  // reports are prefilled per leader, so they don't).
  const dirty = subject.trim() !== initialSubject.trim() || body.trim() !== initialBody.trim() || evidenceUris.length > 0;
  const { allowLeave } = useUnsavedChangesGuard(dirty, { message: "Your ticket isn't sent yet. Leave anyway?" });
  const draft = useDraft(aboutLeader ? null : 'support-ticket', { category, subject, body, evidenceUris }, { isEmpty: () => !dirty });

  function restoreDraft() {
    const saved = draft.restore();
    if (!saved) return;
    setCategory(saved.category);
    setSubject(saved.subject);
    setBody(saved.body);
    setEvidenceUris(saved.evidenceUris ?? []);
  }

  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#111B2E' : '#FBFCFE';

  async function handlePickImages() {
    const remaining = MAX_TICKET_PHOTOS - evidenceUris.length;
    if (remaining <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo library access is needed to attach photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
    if (result.canceled) return;
    setEvidenceUris((prev) => [...prev, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_TICKET_PHOTOS));
  }

  async function handleSubmit() {
    if (!subject.trim()) {
      setErrorMessage('Add a short subject.');
      return;
    }
    if (!body.trim()) {
      setErrorMessage('Please describe what happened.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { data, error } = await createSupportTicket({
      category,
      subject,
      body,
      reportedUserId: aboutLeader ? params.userId : null,
      guildId: aboutLeader ? params.guildId : null,
      evidenceUris,
    });
    setSubmitting(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? 'Failed to send ticket.');
      return;
    }
    draft.clear();
    allowLeave();
    router.replace({ pathname: '/support/[id]', params: { id: data.id } });
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader title={aboutLeader ? 'Report your Guild Leader' : 'New ticket'} subtitle="Sent to the PartyUp team" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="px-4 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {draft.offer ? (
            <View className="mb-4">
              <DraftBanner
                savedAt={draft.offer.savedAt}
                preview={draft.offer.value.subject || null}
                isDark={isDark}
                onContinue={restoreDraft}
                onStartFresh={draft.dismiss}
              />
            </View>
          ) : null}

          {errorMessage ? (
            <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          {aboutLeader ? (
            <View key="leader" className="flex-row items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: border, backgroundColor: inputBg }}>
              <Crown size={18} color="#D88700" />
              <View className="flex-1">
                <Text className="text-sm font-bold" style={{ color: primaryText }}>
                  About {params.userName ?? 'your Guild Leader'}
                </Text>
                <Text className="text-xs" style={{ color: mutedText }}>
                  Guild Leader{params.guildName ? ` of ${params.guildName}` : ''}. Only the PartyUp team sees this, not your guild.
                </Text>
              </View>
            </View>
          ) : (
            <View key="topics">
              <Text className="text-[13px] font-bold" style={{ color: mutedText }}>
                TOPIC
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {TICKET_CATEGORIES.map((type) => {
                  const selected = category === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setCategory(type)}
                      className="rounded-full border px-4 py-2"
                      style={{ borderColor: selected ? '#2A55D4' : border, backgroundColor: selected ? '#2A55D4' : inputBg }}>
                      <Text className="text-sm font-bold" style={{ color: selected ? '#FFFFFF' : primaryText }}>
                        {TICKET_CATEGORY_LABELS[type]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {category === 'safety' ? (
                <Text className="mt-2 text-xs" style={{ color: mutedText }}>
                  In danger right now? Use SOS. To report someone in your guild, use Report a problem on the Guild tab.
                </Text>
              ) : null}
            </View>
          )}

          <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
            SUBJECT
          </Text>
          <TextInput
            className="mt-2 rounded-2xl border px-4 py-3.5 text-base"
            style={{ borderColor: border, backgroundColor: inputBg, color: primaryText }}
            placeholder="In a few words"
            placeholderTextColor={mutedText}
            maxLength={120}
            value={subject}
            onChangeText={setSubject}
          />

          <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
            WHAT HAPPENED
          </Text>
          <TextInput
            className="mt-2 min-h-[140px] rounded-2xl border px-4 py-3.5 text-base"
            style={{ borderColor: border, backgroundColor: inputBg, color: primaryText, textAlignVertical: 'top' }}
            placeholder="Tell us what's going on, with dates and names if they help."
            placeholderTextColor={mutedText}
            multiline
            maxLength={2000}
            value={body}
            onChangeText={setBody}
          />

          <View className="mt-5 flex-row items-center justify-between">
            <Text className="text-[13px] font-bold" style={{ color: mutedText }}>
              ADD PHOTOS (OPTIONAL)
            </Text>
            <Text className="text-xs" style={{ color: mutedText }}>
              {evidenceUris.length}/{MAX_TICKET_PHOTOS}
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
              {evidenceUris.length < MAX_TICKET_PHOTOS && (
                <TouchableOpacity onPress={handlePickImages} className="h-16 w-16 items-center justify-center rounded-xl border border-dashed" style={{ borderColor: border, backgroundColor: inputBg }}>
                  <ImagePlus size={20} color={mutedText} />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity onPress={handleSubmit} disabled={submitting} className={`mt-6 rounded-2xl py-4 ${aboutLeader ? 'bg-[#E32727]' : 'bg-[#284BD6]'}`}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">{aboutLeader ? 'Send report' : 'Send ticket'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
