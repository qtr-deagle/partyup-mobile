import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, BellRing, MapPin, Shield, ShieldAlert, ShieldCheck, SunMedium } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View className="rounded-[22px] border border-[#E9EDF5] bg-white p-4 shadow-sm shadow-black/5">{children}</View>;
}

function SettingRow({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-[18px] bg-[#F3F4F8] px-4 py-4">
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1 pr-2">
        <Text className="text-[18px] font-black text-[#182847]">{title}</Text>
        <Text className="mt-1 text-[15px] leading-5 text-[#67748D]">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D0D5DD', true: '#B9D7FF' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#D0D5DD"
      />
    </View>
  );
}

export default function ModalScreen() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [safetyEdgeTab, setSafetyEdgeTab] = useState(false);
  const [liveLocation, setLiveLocation] = useState(false);
  const [warningAlerts, setWarningAlerts] = useState(false);
  const [emergencySos, setEmergencySos] = useState(false);

  return (
    <ScrollView className="flex-1 bg-[#F7F8FC]" contentContainerClassName="pb-28">
      <View className="border-b border-[#E5EAF2] bg-white px-4 py-4">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full">
            <ArrowLeft size={24} color="#2647B8" />
          </TouchableOpacity>
          <Text className="text-[30px] font-black text-[#2647B8]">Settings</Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <View className="px-4 pt-4 gap-5">
        <SettingsCard>
          <View className="flex-row items-center gap-2">
            <SunMedium size={22} color="#182847" />
            <Text className="text-[22px] font-black text-[#182847]">Appearance</Text>
          </View>

          <View className="mt-4">
            <SettingRow
              icon={<SunMedium size={18} color="#182847" />}
              title="Dark Mode"
              description="Toggle between light and dark theme"
              value={darkMode}
              onValueChange={setDarkMode}
            />
          </View>
        </SettingsCard>

        <SettingsCard>
          <View className="flex-row items-center gap-2">
            <Shield size={22} color="#00A56A" />
            <Text className="text-[22px] font-black text-[#182847]">Safety Features</Text>
          </View>

          <View className="mt-4 gap-4">
            <SettingRow
              icon={<Shield size={18} color="#182847" />}
              title="Safety Edge Tab"
              description="Show safety controls on screen edge"
              value={safetyEdgeTab}
              onValueChange={setSafetyEdgeTab}
            />

            <SettingRow
              icon={<MapPin size={18} color="#182847" />}
              title="Live Location Sharing"
              description="Allow real-time location sharing during trips"
              value={liveLocation}
              onValueChange={setLiveLocation}
            />

            <SettingRow
              icon={<AlertTriangle size={18} color="#182847" />}
              title="Warning Alerts"
              description="Receive safety warnings and alerts"
              value={warningAlerts}
              onValueChange={setWarningAlerts}
            />

            <SettingRow
              icon={<ShieldAlert size={18} color="#E32727" />}
              title="Emergency SOS"
              description="Enable emergency SOS button"
              value={emergencySos}
              onValueChange={setEmergencySos}
            />
          </View>

          <View className="mt-4 rounded-[18px] border border-[#B8EAC9] bg-[#EEFDF3] px-4 py-4">
            <Text className="text-[16px] leading-6 text-[#67748D]">
              <Text className="font-black text-[#00A56A]">Safety Note: </Text>
              These settings help protect you during your travels. We recommend keeping all safety features enabled for maximum protection.
            </Text>
          </View>
        </SettingsCard>

        <SettingsCard>
          <View className="flex-row items-center gap-2">
            <ShieldCheck size={22} color="#00A56A" />
            <Text className="text-[22px] font-black text-[#182847]">Verification</Text>
          </View>

          <View className="mt-4 gap-3">
            {['Email Verified', 'Phone Verified'].map((item) => (
              <View key={item} className="flex-row items-center justify-between rounded-2xl bg-[#F4F8F6] px-4 py-4">
                <Text className="text-[17px] text-[#182847]">{item}</Text>
                <Text className="text-[20px] text-[#00A56A]">✓</Text>
              </View>
            ))}
          </View>
        </SettingsCard>

        <TouchableOpacity className="rounded-2xl border border-[#2647B8] bg-white py-4">
          <Text className="text-center text-[17px] font-medium text-[#2647B8]">Manage Safety Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity className="rounded-2xl border border-[#E32727] bg-white py-4">
          <Text className="text-center text-[17px] font-medium text-[#E32727]">Delete Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
