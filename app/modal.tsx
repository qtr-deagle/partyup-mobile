import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight, Clock3, FileText, IdCard, KeyRound, Lock, MapPin, PanelRightOpen, Shield, ShieldAlert, ShieldCheck, SunMedium, Trash2, Trophy, UserX, Users, Volume2 } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChangePasswordModal from '@/components/ChangePasswordModal';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import LegalModal, { type LegalDoc } from '@/components/LegalModal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth, type VerificationStatus } from '@/hooks/auth-provider';
import { useColorScheme, useThemePreference } from '@/hooks/use-color-scheme';
import { formatDeletionDate } from '@/lib/accountDeletion';
import { setLocationVisibility } from '@/lib/location';
import { setSafetyPreferences } from '@/lib/safety';
import { setSosEdgeEnabled, useSosEdge } from '@/lib/sos-edge';
import { setSoundEnabled, useSoundEnabled } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';

import { showAlert } from '@/lib/dialog';
function IconBadge({ children, tint }: { children: ReactNode; tint: string }) {
  return <View className={`h-9 w-9 items-center justify-center rounded-full ${tint}`}>{children}</View>;
}

function NavRow({
  icon,
  label,
  onPress,
  destructive,
  isDark,
  last,
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  isDark: boolean;
  last?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.98}
      className={`flex-row items-center gap-3 py-3.5 ${last ? '' : `border-b ${isDark ? 'border-[#22324B]' : 'border-[#EEF1F6]'}`}`}>
      {icon}
      <Text className={`flex-1 text-[15px] font-medium ${destructive ? 'text-[#E32727]' : isDark ? 'text-white' : 'text-[#182847]'}`}>{label}</Text>
      <ChevronRight size={18} color={destructive ? '#E32727' : isDark ? '#64748B' : '#A1A8B8'} />
    </AnimatedPressable>
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
      {icon}
      <View className="flex-1 pr-2">
        <Text className={`text-[15px] font-semibold ${isDark ? 'text-white' : 'text-[#182847]'}`}>{title}</Text>
        <Text className={`mt-0.5 text-[13px] leading-[18px] ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>{description}</Text>
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

type VerificationItem = { label: string; state: 'done' | 'pending' | 'missing'; onPress?: '/verify-id' | '/edit-profile' };

// Real status per check; incomplete ones link to where they get fixed.
function verificationItems(idStatus: VerificationStatus | undefined, phone: string | null | undefined): VerificationItem[] {
  return [
    { label: 'Email Verified', state: 'done' },
    idStatus === 'approved'
      ? { label: 'ID Verified', state: 'done' }
      : idStatus === 'pending'
        ? { label: 'ID Under Review', state: 'pending' }
        : { label: idStatus === 'rejected' ? 'ID Rejected - Resubmit' : 'ID Not Verified', state: 'missing', onPress: '/verify-id' },
    phone ? { label: 'Phone Number Added', state: 'done' } : { label: 'Add a Phone Number', state: 'missing', onPress: '/edit-profile' },
  ];
}

export default function ModalScreen() {
  const router = useRouter();
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  const colorScheme = useColorScheme();
  const { setPreference } = useThemePreference();
  const insets = useSafeAreaInsets();
  const [liveLocation, setLiveLocation] = useState(true);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isDark = colorScheme === 'dark';
  const soundEnabled = useSoundEnabled();
  const sosEdge = useSosEdge();

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

  async function handleAccountDeleted(scheduledFor: string | null) {
    setShowDeleteAccount(false);
    await signOut();
    showAlert(
      'Account scheduled for deletion',
      `Your account is deactivated and will be permanently deleted on ${formatDeletionDate(scheduledFor)}. Sign in before then if you change your mind.`
    );
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
    <ScrollView className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FC]'}`} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <ScreenHeader title="Settings" />

      <View className="px-4 pt-4 gap-5">
        <Card index={0}>
          <View className="flex-row items-center gap-2">
            <SunMedium size={18} color={isDark ? '#E2E8F0' : '#182847'} />
            <Text className={`text-[17px] font-bold ${isDark ? 'text-white' : 'text-[#182847]'}`}>Appearance</Text>
          </View>

          <View className="mt-4">
            <SettingRow
              icon={<IconBadge tint={isDark ? 'bg-[#22324B]' : 'bg-white'}><SunMedium size={17} color="#2647B8" /></IconBadge>}
              title="Dark Mode"
              description="Toggle between light and dark theme"
              value={isDark}
              onValueChange={(nextValue) => setPreference(nextValue ? 'dark' : 'light')}
              isDark={isDark}
            />
          </View>
          <View className="mt-3">
            <SettingRow
              icon={<IconBadge tint={isDark ? 'bg-[#22324B]' : 'bg-white'}><Volume2 size={17} color="#2647B8" /></IconBadge>}
              title="Sounds"
              description="Play sounds for messages, notifications and bookings"
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              isDark={isDark}
            />
          </View>
        </Card>

        <Card index={1}>
          <View className="flex-row items-center gap-2">
            <Shield size={18} color="#00A56A" />
            <Text className={`text-[17px] font-bold ${isDark ? 'text-white' : 'text-[#182847]'}`}>Safety Features</Text>
          </View>

          <View className="mt-4 gap-4">
            <SettingRow
              icon={<IconBadge tint={isDark ? 'bg-[#22324B]' : 'bg-white'}><MapPin size={17} color="#2647B8" /></IconBadge>}
              title="Live Location Sharing"
              description="Allow real-time location sharing during trips"
              value={liveLocation}
              onValueChange={(next) => void handleToggleLiveLocation(next)}
              isDark={isDark}
            />

            <SettingRow
              icon={<IconBadge tint={isDark ? 'bg-[#22324B]' : 'bg-white'}><AlertTriangle size={17} color="#2647B8" /></IconBadge>}
              title="Warning Alerts"
              description="Receive safety warnings and alerts"
              value={profile?.warning_alerts_enabled ?? true}
              onValueChange={(next) => void handleToggleWarningAlerts(next)}
              isDark={isDark}
            />

            <SettingRow
              icon={<IconBadge tint={isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]'}><ShieldAlert size={17} color="#E32727" /></IconBadge>}
              title="Emergency SOS"
              description="Enable emergency SOS button"
              value={profile?.emergency_sos_enabled ?? true}
              onValueChange={(next) => void handleToggleEmergencySos(next)}
              isDark={isDark}
            />

            {profile?.emergency_sos_enabled !== false && (
              <SettingRow
                icon={<IconBadge tint={isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]'}><PanelRightOpen size={17} color="#E32727" /></IconBadge>}
                title="SOS Edge Button"
                description="Keep an SOS tab on the edge of every screen. It starts a Warning Mode countdown. Drag it to move it."
                value={sosEdge.enabled}
                onValueChange={setSosEdgeEnabled}
                isDark={isDark}
              />
            )}
          </View>

          <View className={`mt-4 rounded-[18px] border px-4 py-4 ${isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#B8EAC9] bg-[#EEFDF3]'}`}>
            <Text className={`text-[14px] leading-5 ${isDark ? 'text-[#A7F3D0]' : 'text-[#67748D]'}`}>
              <Text className="font-black text-[#00A56A]">Safety Note: </Text>
              These settings help protect you during your travels. We recommend keeping all safety features enabled for maximum protection.
            </Text>
          </View>
        </Card>

        <Card index={2}>
          <View className="flex-row items-center gap-2">
            <ShieldCheck size={18} color="#00A56A" />
            <Text className={`text-[17px] font-bold ${isDark ? 'text-white' : 'text-[#182847]'}`}>Verification</Text>
          </View>

          <View className="mt-4 gap-3">
            {verificationItems(profile?.verification_status, profile?.phone).map(({ label, state, onPress }) => (
              <AnimatedPressable
                key={label}
                onPress={onPress ? () => router.push(onPress) : undefined}
                disabled={!onPress}
                scaleTo={0.98}
                className={`flex-row items-center justify-between rounded-2xl px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F8F6]'}`}>
                <Text className={`text-[15px] ${isDark ? 'text-white' : 'text-[#182847]'}`}>{label}</Text>
                {state === 'done' ? (
                  <ShieldCheck size={18} color="#00A56A" />
                ) : state === 'pending' ? (
                  <Clock3 size={18} color="#D88700" />
                ) : (
                  <AlertTriangle size={18} color="#E32727" />
                )}
              </AnimatedPressable>
            ))}
          </View>
        </Card>

        <Card index={3} className="py-1">
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><KeyRound size={17} color="#2647B8" /></IconBadge>}
            label="Change Password"
            onPress={() => setShowChangePassword(true)}
          />
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><Users size={17} color="#2647B8" /></IconBadge>}
            label="Manage Safety Contacts"
            onPress={() => router.push('/trusted-circle')}
          />
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><UserX size={17} color="#2647B8" /></IconBadge>}
            label="Manage Blocked Users"
            onPress={() => router.push('/blocked-users')}
          />
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><Trophy size={17} color="#2647B8" /></IconBadge>}
            label="Guild & Rewards"
            onPress={() => router.push('/guild')}
          />
          {profile?.role === 'admin' ? (
            <NavRow
              isDark={isDark}
              icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><IdCard size={17} color="#2647B8" /></IconBadge>}
              label="Review ID Verifications"
              onPress={() => router.push('/id-review')}
            />
          ) : null}
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><FileText size={17} color="#2647B8" /></IconBadge>}
            label="Terms & Conditions"
            onPress={() => setLegalDoc('terms')}
          />
          <NavRow
            isDark={isDark}
            icon={<IconBadge tint={isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}><Lock size={17} color="#2647B8" /></IconBadge>}
            label="Privacy Policy"
            onPress={() => setLegalDoc('privacy')}
          />
          {profile?.role === 'admin' ? null : (
            <NavRow
              isDark={isDark}
              destructive
              last
              icon={<IconBadge tint={isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]'}><Trash2 size={17} color="#E32727" /></IconBadge>}
              label="Delete Account"
              onPress={() => setShowDeleteAccount(true)}
            />
          )}
        </Card>
      </View>

      <LegalModal visible={legalDoc !== null} doc={legalDoc ?? 'terms'} isDark={isDark} onClose={() => setLegalDoc(null)} />
      <ChangePasswordModal
        visible={showChangePassword}
        email={session.user.email ?? ''}
        isDark={isDark}
        onClose={() => setShowChangePassword(false)}
        onForgot={() => {
          setShowChangePassword(false);
          router.push({ pathname: '/(auth)/forgot-password', params: { email: session.user.email ?? '', signedIn: '1' } });
        }}
      />
      <DeleteAccountModal
        visible={showDeleteAccount}
        isDark={isDark}
        onClose={() => setShowDeleteAccount(false)}
        onDeleted={handleAccountDeleted}
      />
    </ScrollView>
  );
}
