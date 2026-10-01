import { useAuth } from '@/hooks/auth-provider';
import { requestLocationPermissions, startBackgroundLocationTracking, upsertCurrentLocation } from '@/lib/location';
import { getMyMonitoringSession, startSafetySession, triggerSosAlert, type SafetySession } from '@/lib/safety';
import {
  cancelWarningSession,
  escalateWarningSession,
  getWarningModeState,
  setWarningModalOpen,
  setWarningSession,
} from '@/lib/warningMode';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Clock, MapPin, Shield, ShieldAlert, Siren, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';

// The server enforces the same 30 s – 30 min range (start_safety_session).
const TIMER_PRESETS = [
  { seconds: 30, label: '30s' },
  { seconds: 60, label: '1 min' },
  { seconds: 300, label: '5 min' },
  { seconds: 900, label: '15 min' },
  { seconds: 1800, label: '30 min' },
];
const DEFAULT_DURATION_SECONDS = 60;
const DURATION_STORAGE_KEY = 'partyup.warningModeDuration';

type Phase = 'idle' | 'activating' | 'monitoring' | 'sending' | 'escalated' | 'error';

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  }
  const minutes = totalSeconds / 60;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

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
  const { profile, session: authSession } = useAuth();
  const userId = authSession?.user.id ?? null;
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<SafetySession | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_DURATION_SECONDS);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATION_SECONDS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  function stopCountdown() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  // Counts down to a fixed deadline instead of decrementing a counter, so the
  // time stays right after the JS timer was paused in the background.
  function startCountdown(activeSession: SafetySession, deadlineMs: number) {
    stopCountdown();
    setWarningSession(activeSession, deadlineMs);
    setSession(activeSession);
    setErrorMessage(null);
    setPhase('monitoring');
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        stopCountdown();
        setPhase('sending');
        void handleEscalate(activeSession);
      }
    };
    tick();
    if (deadlineMs > Date.now()) {
      intervalRef.current = setInterval(tick, 1000);
    }
  }

  // On open: restore the last-picked timer and pick up a session that is
  // still running (hidden behind the banner, or from before an app restart).
  // While open, WarningModeBanner steps aside.
  useEffect(() => {
    setWarningModalOpen(visible);
    if (!visible) {
      stopCountdown();
      return;
    }
    const shared = getWarningModeState();
    if (shared.session) {
      startCountdown(shared.session, shared.deadlineMs);
    } else {
      setPhase('idle');
    }
    let cancelled = false;
    void (async () => {
      try {
        const stored = Number(await AsyncStorage.getItem(DURATION_STORAGE_KEY));
        if (!cancelled && TIMER_PRESETS.some((preset) => preset.seconds === stored)) {
          setDurationSeconds(stored);
        }
      } catch {
        // Keeps the default timer.
      }
      if (!userId || shared.session) {
        return;
      }
      const running = await getMyMonitoringSession(userId);
      if (!cancelled && running) {
        startCountdown(running, new Date(running.expires_at).getTime());
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  useEffect(
    () => () => {
      stopCountdown();
      setWarningModalOpen(false);
    },
    []
  );

  function selectDuration(seconds: number) {
    setDurationSeconds(seconds);
    AsyncStorage.setItem(DURATION_STORAGE_KEY, String(seconds)).catch(() => undefined);
  }

  async function handleEscalate(activeSession: SafetySession) {
    stopCountdown();
    const { data, error } = await escalateWarningSession(activeSession.id);
    if (error) {
      setErrorMessage(error.message);
      setPhase('error');
      return;
    }
    setSession(null);
    setRecipientCount(data?.recipient_count ?? 0);
    setPhase('escalated');
  }

  // Skips the countdown entirely for when it's truly urgent.
  async function handleSendNow() {
    if (profile?.emergency_sos_enabled === false) {
      setErrorMessage('Emergency SOS is turned off in Settings.');
      setPhase('error');
      return;
    }
    stopCountdown();
    setPhase('sending');
    setErrorMessage(null);
    if (session) {
      await handleEscalate(session);
      return;
    }
    const { data, error } = await triggerSosAlert(tripId ?? null).catch((caught: Error) => ({ data: null, error: caught }));
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

    const { data, error } = await startSafetySession(tripId ?? null, durationSeconds);
    if (error || !data) {
      setErrorMessage(error?.message ?? 'Unable to start Warning Mode.');
      setPhase('error');
      return;
    }

    startCountdown(data, Date.now() + durationSeconds * 1000);
  }

  // The server escalates an uncancelled session on its own, so a failed
  // cancel keeps the timer on screen instead of pretending it worked.
  async function handleCancel() {
    if (session) {
      setCancelling(true);
      const { error } = await cancelWarningSession(session.id);
      setCancelling(false);
      if (error) {
        setErrorMessage(`Couldn't cancel: ${error.message}. Check your connection and try again.`);
        return;
      }
    }
    stopCountdown();
    setSession(null);
    onClose();
  }

  // Leaves the timer running; WarningModeBanner keeps counting on every screen.
  function handleHide() {
    stopCountdown();
    onClose();
  }

  const warningAlertsEnabled = profile?.warning_alerts_enabled !== false;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={phase === 'sending' ? undefined : phase === 'monitoring' ? handleHide : onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className={`w-full max-w-[440px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          {phase !== 'monitoring' && phase !== 'sending' && (
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
                <Text className={`mt-4 text-center text-headline-24 font-bold ${primary}`}>Activate Warning Mode?</Text>
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
                    <View className={`rounded-2xl px-4 py-3 ${mutedFill}`}>
                      <View className="flex-row items-start gap-3">
                        <Clock size={20} color="#D88700" />
                        <View className="flex-1">
                          <Text className={`text-[15px] font-bold ${primary}`}>Auto-Escalation Timer</Text>
                          <Text className={`mt-0.5 text-[13px] leading-5 ${secondary}`}>
                            Automatically triggers full SOS in {formatDuration(durationSeconds)} if not canceled
                          </Text>
                        </View>
                      </View>
                      <View className="mt-3 flex-row flex-wrap gap-2">
                        {TIMER_PRESETS.map((preset) => {
                          const selected = preset.seconds === durationSeconds;
                          return (
                            <TouchableOpacity
                              key={preset.seconds}
                              onPress={() => selectDuration(preset.seconds)}
                              disabled={phase === 'activating'}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              className={`rounded-full border px-3.5 py-1.5 ${
                                selected ? 'border-[#D88700] bg-[#D88700]' : isDark ? 'border-[#2A3A55]' : 'border-[#DCE1EA] bg-white'
                              }`}>
                              <Text className={`text-[13px] font-bold ${selected ? 'text-white' : primary}`}>{preset.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  <View className={`mt-4 rounded-xl border px-3 py-3 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
                    <Text className={`text-[13px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>
                      Note: You can cancel any time before the timer ends. If your app closes or your phone dies, the SOS is still sent
                      automatically within about a minute of the timer ending.
                    </Text>
                  </View>

                  {errorMessage ? <Text className="mt-3 text-[13px] text-[#E32727]">{errorMessage}</Text> : null}

                  <TouchableOpacity
                    onPress={() => void handleActivate()}
                    disabled={phase === 'activating'}
                    className="mt-5 items-center rounded-2xl bg-[#E32727] py-4">
                    {phase === 'activating' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text className="font-black text-white">
                        Activate Warning Mode ({TIMER_PRESETS.find((preset) => preset.seconds === durationSeconds)?.label})
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleSendNow()}
                    disabled={phase === 'activating'}
                    className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border-2 border-[#E32727] py-4"
                    accessibilityLabel="Send SOS now">
                    <Siren size={18} color="#E32727" />
                    <Text className="font-black text-[#E32727]">Urgent? Send SOS Now</Text>
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
              <Text className={`mt-4 text-center text-headline-18 font-bold ${primary}`}>Warning Mode Active</Text>
              <Text className={`mt-1 text-center text-[14px] ${secondary}`}>Sharing your location with trusted contacts</Text>

              <Text className="mt-6 text-[56px] font-black text-[#E32727]">{formatClock(secondsLeft)}</Text>
              <Text className={`text-[13px] ${secondary}`}>until automatic SOS alert</Text>

              {errorMessage ? <Text className="mt-3 text-center text-[13px] text-[#E32727]">{errorMessage}</Text> : null}

              <TouchableOpacity
                onPress={() => void handleSendNow()}
                disabled={cancelling}
                className="mt-6 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-[#E32727] py-4"
                accessibilityLabel="Send SOS now">
                <Siren size={18} color="#FFFFFF" />
                <Text className="font-black text-white">Send SOS Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleCancel()}
                disabled={cancelling}
                className="mt-3 w-full items-center rounded-2xl bg-[#00A56A] py-4">
                {cancelling ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-black text-white">I&apos;m Safe — Cancel</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleHide} disabled={cancelling} className={`mt-3 w-full items-center rounded-2xl py-4 ${mutedFill}`}>
                <Text className={`font-bold ${primary}`}>Hide — keep using the app</Text>
              </TouchableOpacity>
              <Text className={`mt-2 text-center text-[12px] ${secondary}`}>The timer keeps running in a bar at the top of the screen.</Text>
            </View>
          )}

          {phase === 'sending' && (
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#E32727" />
              <Text className={`mt-4 text-center text-headline-18 font-bold ${primary}`}>Sending SOS…</Text>
              <Text className={`mt-1 text-center text-[14px] ${secondary}`}>Alerting your trusted circle with your location</Text>
            </View>
          )}

          {phase === 'escalated' && (
            <View className="items-center">
              <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#0F3D2E]' : 'bg-[#DDF4EA]'}`}>
                <Shield size={28} color="#00A56A" />
              </View>
              <Text className={`mt-4 text-center text-headline-18 font-bold ${primary}`}>Alert Sent</Text>
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
