import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, MapPin, Shield, ShieldAlert, ShieldCheck, SunMedium } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme, useThemePreference } from '@/hooks/use-color-scheme';
import { setLocationVisibility } from '@/lib/location';
import { setSafetyPreferences } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';

function SettingsCard({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View className={`rounded-[22px] border p-4 shadow-sm ${isDark ? 'border-[#24324A] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'}`}>
      {children}
    </View>
  );
}

function SettingRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  isDark,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  isDark: boolean;
}) {
  return (
    <View className={`flex-row items-center gap-3 rounded-[18px] px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]'}`}>
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1 pr-2">
        <Text className={`text-[18px] font-black ${isDark ? 'text-white' : 'text-[#182847]'}`}>{title}</Text>
        <Text className={`mt-1 text-[15px] leading-5 ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? '#334155' : '#D0D5DD', true: '#B9D7FF' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={isDark ? '#334155' : '#D0D5DD'}
      />
    </View>
  );
}

export default function ModalScreen() {
  const router = useRouter();
  const { session, profile, loading, refreshProfile } = useAuth();
  const colorScheme = useColorScheme();
  const { setPreference } = useThemePreference();
  const insets = useSafeAreaInsets();
  const [liveLocation, setLiveLocation] = useState(true);

  const isDark = colorScheme === 'dark';
  const { titleColor } = getTheme(isDark);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) return;
      void supabase
        .from('current_locations')
        .select('is_visible')
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setLiveLocation(data ? data.is_visible : true);
        });
    }, [session?.user.id])
  );

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  async function handleToggleLiveLocation(next: boolean) {
    setLiveLocation(next);
    const { error } = await setLocationVisibility(next);
    if (error) {
      setLiveLocation(!next);
    }
  }

  async function handleToggleWarningAlerts(next: boolean) {
    const { error } = await setSafetyPreferences({ warningAlertsEnabled: next });
    if (!error) {
      void refreshProfile();
    }
  }

  async function handleToggleEmergencySos(next: boolean) {
    const { error } = await setSafetyPreferences({ emergencySosEnabled: next });
    if (!error) {
      void refreshProfile();
    }
  }

  return (
    <ScrollView className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FC]'}`} contentContainerClassName="pb-28">
      <View
        className={`border-b px-4 pb-4 ${isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-[#E5EAF2] bg-white'}`}
        style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full">
            <ArrowLeft size={24} color={isDark ? '#E2E8F0' : '#182A4D'} />
          </TouchableOpacity>
          <Text className={`${typography.pageTitle} ${titleColor}`}>Settings</Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <View className="px-4 pt-4 gap-5">
        <SettingsCard isDark={isDark}>
          <View className="flex-row items-center gap-2">
            <SunMedium size={22} color={isDark ? '#E2E8F0' : '#182847'} />
            <Text className={`text-[22px] font-black ${isDark ? 'text-white' : 'text-[#182847]'}`}>Appearance</Text>
          </View>

          <View className="mt-4">
            <SettingRow
              icon={<SunMedium size={18} color={isDark ? '#E2E8F0' : '#182847'} />}
              title="Dark Mode"
              description="Toggle between light and dark theme"
              value={isDark}
              onValueChange={(nextValue) => setPreference(nextValue ? 'dark' : 'light')}
              isDark={isDark}
            />
          </View>
        </SettingsCard>

        <SettingsCard isDark={isDark}>
          <View className="flex-row items-center gap-2">
            <Shield size={22} color="#00A56A" />
            <Text className={`text-[22px] font-black ${isDark ? 'text-white' : 'text-[#182847]'}`}>Safety Features</Text>
          </View>

          <View className="mt-4 gap-4">
            <SettingRow
              icon={<MapPin size={18} color={isDark ? '#E2E8F0' : '#182847'} />}
              title="Live Location Sharing"
              description="Allow real-time location sharing during trips"
              value={liveLocation}
              onValueChange={(next) => void handleToggleLiveLocation(next)}
              isDark={isDark}
            />

            <SettingRow
              icon={<AlertTriangle size={18} color={isDark ? '#E2E8F0' : '#182847'} />}
              title="Warning Alerts"
              description="Receive safety warnings and alerts"
              value={profile?.warning_alerts_enabled ?? true}
              onValueChange={(next) => void handleToggleWarningAlerts(next)}
              isDark={isDark}
            />

            <SettingRow
              icon={<ShieldAlert size={18} color="#E32727" />}
              title="Emergency SOS"
              description="Enable emergency SOS button"
              value={profile?.emergency_sos_enabled ?? true}
              onValueChange={(next) => void handleToggleEmergencySos(next)}
              isDark={isDark}
            />
          </View>

          <View className={`mt-4 rounded-[18px] border px-4 py-4 ${isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#B8EAC9] bg-[#EEFDF3]'}`}>
            <Text className={`text-[16px] leading-6 ${isDark ? 'text-[#A7F3D0]' : 'text-[#67748D]'}`}>
              <Text className="font-black text-[#00A56A]">Safety Note: </Text>
              These settings help protect you during your travels. We recommend keeping all safety features enabled for maximum protection.
            </Text>
          </View>
        </SettingsCard>

        <SettingsCard isDark={isDark}>
          <View className="flex-row items-center gap-2">
            <ShieldCheck size={22} color="#00A56A" />
            <Text className={`text-[22px] font-black ${isDark ? 'text-white' : 'text-[#182847]'}`}>Verification</Text>
          </View>

          <View className="mt-4 gap-3">
            {['Email Verified', 'Phone Verified'].map((item) => (
              <View key={item} className={`flex-row items-center justify-between rounded-2xl px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F8F6]'}`}>
                <Text className={`text-[17px] ${isDark ? 'text-white' : 'text-[#182847]'}`}>{item}</Text>
                <Text className="text-[20px] text-[#00A56A]">✓</Text>
              </View>
            ))}
          </View>
        </SettingsCard>

        <TouchableOpacity onPress={() => router.push('/trusted-circle')} className={`rounded-2xl border py-4 ${isDark ? 'border-[#334155] bg-[#111B2E]' : 'border-[#2647B8] bg-white'}`}>
          <Text className={`text-center text-[17px] font-medium ${isDark ? 'text-[#E2E8F0]' : 'text-[#2647B8]'}`}>Manage Safety Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity className={`rounded-2xl border py-4 ${isDark ? 'border-[#7F1D1D] bg-[#111827]' : 'border-[#E32727] bg-white'}`}>
          <Text className="text-center text-[17px] font-medium text-[#E32727]">Delete Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
