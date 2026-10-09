import WarningModeModal from '@/components/WarningModeModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getMyMonitoringSession } from '@/lib/safety';
import { feedback } from '@/lib/sounds';
import {
  cancelWarningSession,
  escalateWarningSession,
  getWarningModeState,
  onWarningModeChange,
  setWarningSession,
  type WarningModeState,
} from '@/lib/warningMode';
import { Clock, ShieldCheck, Siren } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Global, app-wide: while a Warning Mode timer runs with its full-screen modal
// hidden, keeps a bar on screen with the countdown, "I'm safe" and "SOS", and
// escalates when it hits zero. Also picks a running timer back up after an app
// restart. Once escalated, ActiveSosBanner takes over.
export default function WarningModeBanner() {
  const { session: authSession } = useAuth();
  const userId = authSession?.user.id ?? null;
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [warning, setWarning] = useState<WarningModeState>(getWarningModeState);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const sessionId = warning.session?.id ?? null;

  useEffect(() => onWarningModeChange(setWarning), []);

  useEffect(() => {
    if (!userId) {
      setWarningSession(null);
      return;
    }
    void getMyMonitoringSession(userId).then((running) => {
      if (running && !getWarningModeState().session) {
        setWarningSession(running, new Date(running.expires_at).getTime());
      }
    });
  }, [userId]);

  // The modal runs its own countdown while open; this one takes over when
  // it's hidden. escalateWarningSession dedupes, so an overlap can't double-send.
  useEffect(() => {
    if (!sessionId || warning.modalOpen) {
      return;
    }
    const deadlineMs = warning.deadlineMs;
    let escalating = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !escalating) {
        escalating = true;
        clearInterval(interval);
        void escalateWarningSession(sessionId).then(({ error }) => {
          if (error) {
            feedback.error();
            showAlert('Unable to send SOS', `${error.message} The server will still send it within about a minute.`);
          } else {
            feedback.notify();
          }
        });
      }
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [sessionId, warning.deadlineMs, warning.modalOpen]);

  async function handleSafe() {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    const { error } = await cancelWarningSession(sessionId);
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert("Couldn't cancel Warning Mode", `${error.message} Check your connection and try again.`);
      return;
    }
    feedback.success();
  }

  function confirmSos() {
    if (!sessionId) {
      return;
    }
    showAlert('Send SOS now?', 'This immediately alerts your trusted circle with your live location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send SOS',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await escalateWarningSession(sessionId);
          setBusy(false);
          if (error) {
            feedback.error();
            showAlert('Unable to send SOS', error.message);
            return;
          }
          feedback.notify();
        },
      },
    ]);
  }

  return (
    <>
      {sessionId && !warning.modalOpen ? (
        <Animated.View
          key={sessionId}
          entering={FadeInUp.duration(250)}
          exiting={FadeOutUp.duration(200)}
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, zIndex: 899 }}>
          <View
            className="flex-row items-center rounded-2xl bg-[#B45309] px-3 py-2.5"
            style={{ shadowColor: '#78350F', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              className="flex-1 flex-row items-center"
              accessibilityLabel="Open Warning Mode">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Clock size={18} color="#FFFFFF" />
              </View>
              <View className="ml-2.5 flex-1">
                <Text className="text-[14px] font-bold text-white">Warning Mode · {formatClock(secondsLeft)}</Text>
                <Text numberOfLines={1} className="mt-0.5 text-[12px] text-white/85">
                  SOS sends automatically at 0:00
                </Text>
              </View>
            </TouchableOpacity>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginHorizontal: 12 }} />
            ) : (
              <>
                <TouchableOpacity
                  onPress={confirmSos}
                  className="ml-2 flex-row items-center gap-1 rounded-xl bg-[#E32727] px-2.5 py-2"
                  accessibilityLabel="Send SOS now">
                  <Siren size={14} color="#FFFFFF" />
                  <Text className="text-[13px] font-bold text-white">SOS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleSafe()}
                  className="ml-2 flex-row items-center gap-1 rounded-xl bg-white px-2.5 py-2"
                  accessibilityLabel="I'm safe, cancel Warning Mode">
                  <ShieldCheck size={14} color="#B45309" />
                  <Text className="text-[13px] font-bold text-[#B45309]">I&apos;m safe</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      ) : null}
      <WarningModeModal visible={modalVisible} onClose={() => setModalVisible(false)} isDark={isDark} />
    </>
  );
}
