import { riseIn } from '@/components/ui/motion';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { EMPTY_PICKS, MAX_PICKS_PER_CATEGORY, PLAN_CATEGORIES, PLAN_DESCRIPTION_MAX, type ChoiceCategory, type PlanPicks } from '@/lib/travelPlans';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

type CreatePlanModalProps = {
  visible: boolean;
  value: PlanPicks | null;
  isDark: boolean;
  saving: boolean;
  errorMessage: string | null;
  onSave: (value: PlanPicks) => void;
  onClose: () => void;
};

export function CreatePlanModal({ visible, value, isDark, saving, errorMessage, onSave, onClose }: CreatePlanModalProps) {
  const [draft, setDraft] = useState<PlanPicks>(value ?? EMPTY_PICKS);
  const { height } = useWindowDimensions();

  const background = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const inputBorder = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D8E0EE] bg-white';
  const chipIdle = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]';

  const complete = draft.ride.length > 0 && draft.destination.length > 0 && draft.food.length > 0;

  function handleClose() {
    if (saving) return;
    confirmDiscard(JSON.stringify(draft) !== JSON.stringify(value ?? EMPTY_PICKS), onClose, { message: "Your plan changes aren't saved yet. Discard them?" });
  }

  // Up to two picks per category; tapping a third replaces the oldest pick.
  function toggle(category: ChoiceCategory, option: string) {
    setDraft((current) => {
      const picks = current[category];
      if (picks.includes(option)) return { ...current, [category]: picks.filter((item) => item !== option) };
      const next = picks.length >= MAX_PICKS_PER_CATEGORY ? [...picks.slice(1), option] : [...picks, option];
      return { ...current, [category]: next };
    });
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onShow={() => setDraft(value ?? EMPTY_PICKS)} onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 items-center justify-center px-4">
        <Pressable className="absolute inset-0 bg-black/40" onPress={handleClose} />
        <Animated.View entering={riseIn(0, 380)} style={{ maxHeight: height * 0.85 }} className={`w-full max-w-[420px] overflow-hidden rounded-[28px] ${background}`}>
          <View className="flex-row items-start justify-between px-5 pb-3 pt-5">
            <View className="flex-1 pr-3">
              <Text className={`text-headline-20 font-bold ${textPrimary}`}>Your plan</Text>
              <Text className={`mt-1 text-sm ${textSecondary}`}>Pick 1 or 2 in each. Your matches are scored from these.</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={10}><X size={22} color={isDark ? '#E2E8F0' : '#182847'} /></TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerClassName="px-5 pb-4 pt-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              <View className="gap-4">
                {PLAN_CATEGORIES.map((category) => (
                  <View key={category.key}>
                    <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>{category.label}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {category.options.map((option) => {
                        const selected = draft[category.key].includes(option.value);
                        return (
                          <TouchableOpacity key={option.value} onPress={() => toggle(category.key, option.value)} className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${selected ? 'border-[#2445B8] bg-[#E9EEFF]' : chipIdle}`}>
                            {selected ? <Check size={13} color="#2445B8" /> : null}
                            <Text className={`text-[14px] font-semibold ${selected ? 'text-[#2445B8]' : textPrimary}`}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

                <View>
                  <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Missions (optional)</Text>
                  <TouchableOpacity onPress={() => setDraft((current) => ({ ...current, missions: !current.missions }))} className={`flex-row items-center gap-1.5 self-start rounded-full border px-4 py-2 ${draft.missions ? 'border-[#2445B8] bg-[#E9EEFF]' : chipIdle}`}>
                    {draft.missions ? <Check size={13} color="#2445B8" /> : null}
                    <Text className={`text-[14px] font-semibold ${draft.missions ? 'text-[#2445B8]' : textPrimary}`}>Mission completion</Text>
                  </TouchableOpacity>
                  <Text className={`mt-1.5 text-[12px] leading-4 ${textSecondary}`}>Turn on to also match with travelers who want to clear missions together.</Text>
                </View>

                <View>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className={`text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Note (optional)</Text>
                    <Text className={`text-[12px] ${textSecondary}`}>{(draft.description ?? '').length}/{PLAN_DESCRIPTION_MAX}</Text>
                  </View>
                  <TextInput
                    value={draft.description ?? ''}
                    onChangeText={(text) => setDraft((current) => ({ ...current, description: text }))}
                    maxLength={PLAN_DESCRIPTION_MAX}
                    multiline
                    placeholder="e.g. Weekend ride to Baler, chill pace"
                    placeholderTextColor="#8A93A8"
                    className={`min-h-[72px] rounded-2xl border px-4 py-3 text-[15px] ${inputBorder} ${textPrimary}`}
                    style={{ textAlignVertical: 'top' }}
                  />
                  <Text className={`mt-1.5 text-[12px] leading-4 ${textSecondary}`}>Shown on your card. It doesn&apos;t change your match score.</Text>
                </View>
              </View>

          </ScrollView>

          <View className={`border-t px-5 pb-5 pt-3 ${isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]'}`}>
            {errorMessage ? <Text className="mb-3 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
            <TouchableOpacity onPress={() => onSave(draft)} disabled={!complete || saving} className={`items-center justify-center rounded-2xl py-3.5 ${complete && !saving ? 'bg-[#284BD6]' : 'bg-[#A9B6E0]'}`}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">{complete ? 'Save plan' : 'Pick at least one in each'}</Text>}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
