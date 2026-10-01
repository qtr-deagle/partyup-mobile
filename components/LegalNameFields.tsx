import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { NAME_SUFFIXES, type LegalName } from '@/lib/names';

type FieldKey = 'firstName' | 'middleName' | 'lastName';

type Props = {
  value: LegalName;
  onChange: (value: LegalName) => void;
  noMiddleName: boolean;
  onNoMiddleNameChange: (value: boolean) => void;
  isDark?: boolean;
};

// First / middle / last / suffix inputs, matching how names are printed on
// Philippine IDs. Used by sign-up and by the ID verification screen for
// accounts created before these fields existed.
export default function LegalNameFields({ value, onChange, noMiddleName, onNoMiddleNameChange, isDark }: Props) {
  const [focused, setFocused] = useState<FieldKey | null>(null);
  const set = (key: keyof LegalName) => (text: string) => onChange({ ...value, [key]: text });

  const labelColor = isDark ? 'text-[#CBD5E1]' : 'text-[#273142]';
  const hintColor = isDark ? 'text-[#94A3B8]' : 'text-[#697386]';
  const textColor = isDark ? 'text-white' : 'text-[#273142]';
  const boxClass = (key: FieldKey, disabled = false) =>
    `h-[44px] flex-row items-center rounded-[10px] border px-3 ${
      focused === key
        ? isDark ? 'border-[#7DA3FF] bg-[#18253C]' : 'border-[#2445B8] bg-white'
        : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F1F2F4]'
    } ${disabled ? 'opacity-50' : ''}`;

  const input = (key: FieldKey, placeholder: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <TextInput
      className={`flex-1 text-[14px] ${textColor}`}
      placeholder={placeholder}
      placeholderTextColor="#9AA3B1"
      autoCapitalize="words"
      autoCorrect={false}
      value={value[key]}
      onChangeText={set(key)}
      onFocus={() => setFocused(key)}
      onBlur={() => setFocused((current) => (current === key ? null : current))}
      maxLength={80}
      {...extra}
    />
  );

  return (
    <View className="gap-4">
      <Text className={`text-[11px] leading-4 ${hintColor}`}>Enter your name exactly as it appears on your government ID.</Text>

      <View>
        <Text className={`mb-2 text-[12px] font-medium ${labelColor}`}>First Name</Text>
        <View className={boxClass('firstName')}>{input('firstName', 'e.g. Juan Miguel', { autoComplete: 'name-given', textContentType: 'givenName' })}</View>
        <Text className={`mt-1.5 text-[11px] leading-4 ${hintColor}`}>Include your second given name if you have one.</Text>
      </View>

      <View>
        <Text className={`mb-2 text-[12px] font-medium ${labelColor}`}>Middle Name</Text>
        <View className={boxClass('middleName', noMiddleName)}>
          {input('middleName', noMiddleName ? 'No middle name' : 'e.g. Santos', {
            editable: !noMiddleName,
            autoComplete: 'name-middle',
            textContentType: 'middleName',
          })}
        </View>
        <TouchableOpacity
          onPress={() => onNoMiddleNameChange(!noMiddleName)}
          className="mt-2 flex-row items-center gap-2"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: noMiddleName }}>
          <View className={`h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${noMiddleName ? 'border-[#2445B8] bg-[#2445B8]' : 'border-[#B4BCC8]'}`}>
            {noMiddleName ? <Check size={12} color="#FFFFFF" /> : null}
          </View>
          <Text className={`text-[12px] ${hintColor}`}>I don&apos;t have a middle name</Text>
        </TouchableOpacity>
      </View>

      <View>
        <Text className={`mb-2 text-[12px] font-medium ${labelColor}`}>Last Name</Text>
        <View className={boxClass('lastName')}>{input('lastName', 'e.g. Dela Cruz', { autoComplete: 'name-family', textContentType: 'familyName' })}</View>
      </View>

      <View>
        <Text className={`mb-2 text-[12px] font-medium ${labelColor}`}>
          Suffix <Text className={`font-normal ${hintColor}`}>(optional)</Text>
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {['None', ...NAME_SUFFIXES].map((option) => {
            const selected = option === 'None' ? !value.suffix : value.suffix === option;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => set('suffix')(option === 'None' ? '' : option)}
                className={`h-[34px] min-w-[48px] items-center justify-center rounded-full border px-3 ${
                  selected ? 'border-[#2445B8] bg-[#E9EEFF]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                }`}>
                <Text className={`text-[13px] font-medium ${selected ? 'text-[#2445B8]' : textColor}`}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
