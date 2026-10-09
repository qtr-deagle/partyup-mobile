import { Check, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { composeReason, type ReasonPreset, type ReasonValue } from '@/lib/reasonPresets';

// Multi-select quick reasons plus an optional details box, with a preview of
// the exact message the reason becomes. Same behavior as the website's
// ReasonChips (PartyUp-main/client/src/components/ReasonChips.tsx).
export default function ReasonChips({
  presets,
  value,
  onChange,
  isDark,
  label = 'Quick reasons',
  required = false,
  audience,
  maxLength,
}: {
  presets: ReasonPreset[];
  value: ReasonValue;
  onChange: (next: ReasonValue) => void;
  isDark: boolean;
  label?: string;
  required?: boolean;
  /** "The traveler" etc.; omit for a note only staff see. */
  audience?: string;
  maxLength?: number;
}) {
  const [detailsOpen, setDetailsOpen] = useState(value.details.length > 0);
  const preview = composeReason(presets, value);

  const primary = isDark ? '#F8FAFC' : '#182847';
  const muted = isDark ? '#94A3B8' : '#67748D';
  const chipBorder = isDark ? '#22324B' : '#E1E7F2';
  const chipFill = isDark ? '#18253C' : '#F3F5FA';

  function toggle(index: number) {
    onChange({
      ...value,
      selected: value.selected.includes(index) ? value.selected.filter((i) => i !== index) : [...value.selected, index],
    });
  }

  return (
    <View className="gap-2.5">
      <Text className="text-[13px] font-bold" style={{ color: muted }}>
        {label.toUpperCase()}
        {required ? <Text style={{ color: '#E32727' }}> *</Text> : null}
      </Text>

      <View className="flex-row flex-wrap gap-2">
        {presets.map((preset, index) => {
          const active = value.selected.includes(index);
          return (
            <TouchableOpacity key={preset.label} onPress={() => toggle(index)} activeOpacity={0.8} accessibilityState={{ selected: active }}>
              <View
                className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-2"
                style={{ borderColor: active ? '#284BD6' : chipBorder, backgroundColor: active ? '#284BD6' : chipFill }}>
                {active ? <Check size={14} color="#FFFFFF" /> : null}
                <Text className="text-[13px] font-bold" style={{ color: active ? '#FFFFFF' : primary }}>
                  {preset.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {detailsOpen ? (
        <TextInput
          className="min-h-[64px] rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: chipBorder, backgroundColor: chipFill, color: primary, textAlignVertical: 'top' }}
          placeholder="Add details (optional)"
          placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
          value={value.details}
          onChangeText={(details) => onChange({ ...value, details })}
          multiline
          autoFocus
          maxLength={maxLength}
        />
      ) : (
        <TouchableOpacity onPress={() => setDetailsOpen(true)} className="flex-row items-center gap-1 self-start py-1">
          <Plus size={14} color="#284BD6" />
          <Text className="text-[13px] font-bold text-[#284BD6]">Add details</Text>
        </TouchableOpacity>
      )}

      {preview ? (
        <View className="rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: isDark ? '#111B2E' : '#F7F9FD', borderWidth: 1, borderColor: chipBorder }}>
          <Text className="text-[11px] font-bold" style={{ color: muted }}>
            {(audience ? `${audience} will see` : 'Saved with the report').toUpperCase()}
          </Text>
          <Text className="mt-0.5 text-[13px] leading-5" style={{ color: primary }}>
            {maxLength ? preview.slice(0, maxLength) : preview}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
