import { AlertCircle, CheckCircle2, Circle, Eye, EyeOff, KeyRound, Lock } from 'lucide-react-native';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';
import { rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';

// Same rules as sign-up and forgot-password.
const PASSWORD_RULES: [string, (value: string) => boolean][] = [
  ['At least 8 characters', (value) => value.length >= 8],
  ['Upper and lowercase letters', (value) => /[a-z]/.test(value) && /[A-Z]/.test(value)],
  ['A number', (value) => /\d/.test(value)],
  ['A symbol (e.g. ! @ #)', (value) => /[^A-Za-z0-9]/.test(value)],
];

type Field = 'current' | 'next' | 'confirm';

// Change password while signed in. The current password is checked first by
// signing in with it, since the project doesn't require reauthentication.
export default function ChangePasswordModal({
  visible,
  email,
  onClose,
  onForgot,
  isDark,
}: {
  visible: boolean;
  email: string;
  onClose: () => void;
  /** Opens the emailed-code reset flow for users who don't remember the current one. */
  onForgot: () => void;
  isDark: boolean;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState<Field | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const divider = isDark ? 'bg-[#22324B]' : 'bg-[#E4E7EE]';
  const iconColor = isDark ? '#94A3B8' : '#7C8798';

  const nextValid = PASSWORD_RULES.every(([, test]) => test(next));
  const canSave = current.length > 0 && nextValid && confirm.length > 0 && !saving;

  // Typed passwords: ask before closing (the "Done" screen closes directly).
  function handleCancel() {
    confirmDiscard(!done && !!(current || next || confirm), onClose, { message: "Your new password isn't saved yet. Discard it?" });
  }

  function handleShow() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setShowPasswords(false);
    setSaving(false);
    setDone(false);
    setErrorMessage(null);
  }

  function fail(message: string) {
    setErrorMessage(message);
    setSaving(false);
    feedback.error();
  }

  async function handleSave() {
    if (next !== confirm) return fail('New passwords do not match.');
    if (next === current) return fail('Your new password must be different from your current one.');

    setSaving(true);
    setErrorMessage(null);
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (checkError) {
      if (rateLimitWaitSeconds(checkError) !== null) return fail('Too many attempts. Please wait a moment and try again.');
      return fail('Your current password is incorrect.');
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      if (rateLimitWaitSeconds(error) !== null) return fail('Too many attempts. Please wait a moment and try again.');
      return fail(error.code === 'same_password' ? 'Your new password must be different from your current one.' : error.message);
    }
    setSaving(false);
    setDone(true);
    feedback.success();
  }

  const inputBox = (field: Field) =>
    `h-[46px] flex-row items-center rounded-2xl border px-3.5 ${
      focused === field
        ? `border-[#2445B8] ${isDark ? 'bg-[#0B1220]' : 'bg-white'}`
        : isDark
          ? 'border-[#22324B] bg-[#18253C]'
          : 'border-[#E2E5E9] bg-[#F3F4F8]'
    }`;

  function passwordInput(field: Field, label: string, value: string, onChange: (text: string) => void, extra?: object) {
    return (
      <View>
        <Text className={`mb-2 text-[13px] font-semibold ${primary}`}>{label}</Text>
        <View className={inputBox(field)}>
          <Lock size={17} color={iconColor} />
          <TextInput
            className={`ml-2 flex-1 text-[14px] ${primary}`}
            placeholder="********"
            placeholderTextColor="#9AA3B1"
            secureTextEntry={!showPasswords}
            autoCapitalize="none"
            autoCorrect={false}
            value={value}
            onChangeText={(text) => {
              onChange(text);
              setErrorMessage(null);
            }}
            onFocus={() => setFocused(field)}
            onBlur={() => setFocused(null)}
            editable={!saving}
            {...extra}
          />
          {field === 'current' ? (
            <TouchableOpacity onPress={() => setShowPasswords((shown) => !shown)} accessibilityLabel={showPasswords ? 'Hide passwords' : 'Show passwords'}>
              {showPasswords ? <EyeOff size={17} color={iconColor} /> : <Eye size={17} color={iconColor} />}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onShow={handleShow} onRequestClose={saving ? undefined : handleCancel}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 items-center justify-center bg-black/45 px-4">
          <Animated.View entering={riseIn(0, 380)} className={`max-h-[90%] w-full max-w-[440px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className={`text-headline-24 font-bold leading-8 ${primary}`}>{done ? 'Password changed' : 'Change password'}</Text>
                  <Text className={`mt-1 text-[14px] leading-5 ${secondary}`}>
                    {done ? 'Use your new password the next time you sign in.' : 'Enter your current password, then choose a new one.'}
                  </Text>
                </View>
                <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#1B2A4A]' : 'bg-[#EEF3FF]'}`}>
                  {done ? <CheckCircle2 size={26} color="#00A56A" /> : <KeyRound size={26} color="#2445B8" />}
                </View>
              </View>

              {done ? null : (
                <View className="mt-5 gap-4">
                  <View>
                    {passwordInput('current', 'Current Password', current, setCurrent, { autoComplete: 'current-password', textContentType: 'password', autoFocus: true })}
                    <TouchableOpacity onPress={onForgot} disabled={saving} className="mt-2 self-end">
                      <Text className="text-[12px] font-semibold text-[#2445B8]">Forgot your password?</Text>
                    </TouchableOpacity>
                  </View>

                  <View>
                    {passwordInput('next', 'New Password', next, setNext, { autoComplete: 'new-password', textContentType: 'newPassword' })}
                    <View className="mt-2 gap-1">
                      {PASSWORD_RULES.map(([label, test]) => {
                        const passed = test(next);
                        return (
                          <View key={label} className="flex-row items-center gap-1.5">
                            {passed ? <CheckCircle2 size={13} color="#00A56A" /> : <Circle size={13} color="#9AA3B1" />}
                            <Text className={`text-[11px] ${passed ? 'text-[#00A56A]' : secondary}`}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View>
                    {passwordInput('confirm', 'Repeat New Password', confirm, setConfirm, { onSubmitEditing: () => canSave && void handleSave(), returnKeyType: 'done' })}
                    {confirm.length >= next.length && confirm.length > 0 && confirm !== next ? (
                      <Text className="mt-1.5 text-[11px] text-[#E11D48]">Passwords do not match.</Text>
                    ) : null}
                  </View>
                </View>
              )}

              {errorMessage ? (
                <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-[#FFF1F3] px-4 py-3">
                  <AlertCircle size={16} color="#E11D48" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-[13px] leading-5 text-[#BE123C]">{errorMessage}</Text>
                </View>
              ) : null}

              <View className={`mt-5 h-px ${divider}`} />

              {done ? (
                <TouchableOpacity onPress={onClose} className="mt-5">
                  <View className="items-center rounded-full bg-[#2445B8] py-3.5">
                    <Text className="font-black text-white">Done</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View className="mt-5 flex-row gap-3">
                  <TouchableOpacity onPress={handleCancel} disabled={saving} className="flex-1">
                    <View className={`items-center rounded-full border-[1.5px] py-3.5 ${isDark ? 'border-[#475569]' : 'border-[#182847]'}`}>
                      <Text className={`font-bold ${primary}`}>Cancel</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void handleSave()} disabled={!canSave} className="flex-[1.4]">
                    <View className={`items-center rounded-full py-3.5 ${canSave || saving ? 'bg-[#2445B8]' : isDark ? 'bg-[#22324B]' : 'bg-[#A9B6E0]'}`}>
                      {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">Update password</Text>}
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
