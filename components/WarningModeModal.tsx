import { useAuth } from '@/hooks/auth-provider';
import { requestLocationPermissions, startBackgroundLocationTracking, upsertCurrentLocation } from '@/lib/location';
import { cancelSafetySession, escalateSafetySession, startSafetySession, type SafetySession } from '@/lib/safety';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Clock, MapPin, Shield, ShieldAlert, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';

const DURATION_SECONDS = 60;

type Phase = 'idle' | 'activating' | 'monitoring' | 'escalated' | 'error';

export default function WarningModeModal({
  visible,
  onClose,
  isDark,
  tripId,
}: {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  tripId?: string | null;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<SafetySession | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setErrorMessage(null);
      setSecondsLeft(DURATION_SECONDS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function handleEscalate(activeSession: SafetySession) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const { data, error } = await escalateSafetySession(activeSession.id);
    if (error) {
      setErrorMessage(error.message);
      setPhase('error');
      return;
    }
    setRecipientCount(data?.recipient_count ?? 0);
    setPhase('escalated');
  }

  async function handleActivate() {
    setPhase('activating');
    setErrorMessage(null);

    const permissions = await requestLocationPermissions();
    if (!permissions.foreground) {
      setErrorMessage('Location permission is required to activate Warning Mode.');
      setPhase('error');
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await upsertCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    } catch {
      // Best-effort -- background task will populate location shortly.
    }

    await startBackgroundLocationTracking();

    const { data, error } = await startSafetySession(tripId ?? null, DURATION_SECONDS);
    if (error || !data) {
      setErrorMessage(error?.message ?? 'Unable to start Warning Mode.');
      setPhase('error');
      return;
    }

    setSession(data);
    setSecondsLeft(DURATION_SECONDS);
    setPhase('monitoring');

    intervalRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          void handleEscalate(data);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function handleCancel() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (session) {
      await cancelSafetySession(session.id);
    }
    setSession(null);
    onClose();
  }

  const warningAlertsEnabled = profile?.warning_alerts_enabled !== false;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={phase === 'monitoring' ? undefined : onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className={`w-full max-w-[440px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          {phase !== 'monitoring' && (
            <TouchableOpacity onPress={onClose} className={`absolute right-4 top-4 h-9 w-9 items-center justify-center rounded-full ${mutedFill}`}>
              <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
            </TouchableOpacity>
          )}

          {(phase === 'idle' || phase === 'activating' || phase === 'error') && (
            <>
              <View className="items-center">
                <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#3A1B29]' : 'bg-[#FFE1DC]'}`}>
                  <ShieldAlert size={28} color="#E32727" />
                </View>
                <Text className={`mt-4 text-center text-[22px] font-black ${primary}`}>Activate Warning Mode?</Text>
              </View>

              {!warningAlertsEnabled ? (
                <View className={`mt-5 rounded-2xl border px-4 py-4 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
                  <Text className={`text-[14px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>
                    Warning Alerts are turned off in Settings. Enable them to activate Warning Mode.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      router.push('/modal');
                    }}
                    className="mt-3 self-start">
                    <Text className="text-[14px] font-bold text-[#284BD6]">Open Settings</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="mt-5 gap-3">
                    <View className={`flex-row items-start gap-3 rounded-2xl px-4 py-3 ${mutedFill}`}>
                      <MapPin size={20} color="#284BD6" />
                      <View className="flex-1">
                        <Text className={`text-[15px] font-bold ${primary}`}>Share Your Location</Text>
                        <Text className={`mt-0.5 text-[13px] leading-5 ${secondary}`}>Live location sent to trusted contacts</Text>
                      </View>
                    </View>
                    <View className={`flex-row items-start gap-3 rounded-2xl px-4 py-3 ${mutedFill}`}>
                      <Shield size={20} color="#00A56A" />
                      <View className="flex-1">
                        <Text className={`text-[15px] font-bold ${primary}`}>Start Safety Monitoring</Text>
                        <Text className={`mt-0.5 text-[13px] leading-5 ${secondary}`}>Background tracking and monitoring enabled</Text>
                      </View>
                    </View>
                    <View className={`flex-row items-start gap-3 rounded-2xl px-4 py-3 ${mutedFill}`}>
                      <Clock size={20} color="#D88700" />
                      <View className="flex-1">
                        <Text className={`text-[15px] font-bold ${primary}`}>Auto-Escalation Timer</Text>
                        <Text className={`mt-0.5 text-[13px] leading-5 ${secondary}`}>
                          Automatically triggers full SOS in {DURATION_SECONDS} seconds if not canceled
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className={`mt-4 rounded-xl border px-3 py-3 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
                    <Text className={`text-[13px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>
                      Note: You can cancel at any time by tapping Cancel below. Auto-escalation only works while the app stays open or
                      running in the background — it can&apos;t fire if the app is fully closed.
                    </Text>
                  </View>

                  {errorMessage ? <Text className="mt-3 text-[13px] text-[#E32727]">{errorMessage}</Text> : null}

                  <TouchableOpacity
                    onPress={() => void handleActivate()}
                    disabled={phase === 'activating'}
                    className="mt-5 items-center rounded-2xl bg-[#E32727] py-4">
                    {phase === 'activating' ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">Activate Warning Mode</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onClose} className={`mt-3 items-center rounded-2xl py-4 ${mutedFill}`}>
                    <Text className={`font-bold ${primary}`}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {phase === 'monitoring' && (
            <View className="items-center">
              <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#3A1B29]' : 'bg-[#FFE1DC]'}`}>
                <ShieldAlert size={28} color="#E32727" />
              </View>
              <Text className={`mt-4 text-center text-[18px] font-black ${primary}`}>Warning Mode Active</Text>
              <Text className={`mt-1 text-center text-[14px] ${secondary}`}>Sharing your location with trusted contacts</Text>

              <Text className="mt-6 text-[56px] font-black text-[#E32727]">{secondsLeft}s</Text>
              <Text className={`text-[13px] ${secondary}`}>until automatic SOS alert</Text>

              <TouchableOpacity onPress={() => void handleCancel()} className="mt-6 w-full items-center rounded-2xl bg-[#00A56A] py-4">
                <Text className="font-black text-white">I&apos;m Safe — Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'escalated' && (
            <View className="items-center">
              <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#0F3D2E]' : 'bg-[#DDF4EA]'}`}>
                <Shield size={28} color="#00A56A" />
              </View>
              <Text className={`mt-4 text-center text-[18px] font-black ${primary}`}>Alert Sent</Text>
              <Text className={`mt-2 text-center text-[14px] leading-5 ${secondary}`}>
                {recipientCount > 0
                  ? `${recipientCount} trusted contact${recipientCount === 1 ? '' : 's'} notified with your location.`
                  : "You don't have any trusted contacts with alerts enabled yet."}
              </Text>
              <TouchableOpacity onPress={onClose} className="mt-6 w-full items-center rounded-2xl bg-[#284BD6] py-4">
                <Text className="font-black text-white">Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
