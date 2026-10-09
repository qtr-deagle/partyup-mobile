import { useAuth } from '@/hooks/auth-provider';
import { triggerSosAlert } from '@/lib/safety';
import { feedback } from '@/lib/sounds';
import { useRouter } from 'expo-router';
import { useState } from 'react';


import { showAlert } from '@/lib/dialog';
// The confirm-then-send SOS flow behind the Home SOS card.
export function useSosTrigger() {
  const router = useRouter();
  const { profile } = useAuth();
  const [sendingSos, setSendingSos] = useState(false);

  async function sendSos(tripId: string | null) {
    setSendingSos(true);
    const { data, error } = await triggerSosAlert(tripId);
    setSendingSos(false);
    if (error) {
      feedback.error();
      showAlert('Unable to send SOS', error.message);
      return;
    }
    feedback.notify();
    showAlert(
      'SOS sent',
      'PartyUp Guild Leaders can now see your live location' +
        (data && data.recipient_count > 0
          ? ` and ${data.recipient_count} trusted contact${data.recipient_count === 1 ? ' was' : 's were'} notified.`
          : ". You don't have any trusted contacts with alerts enabled yet.") +
        " Tap \"I'm safe\" when you're OK."
    );
  }

  function requestSos(tripId: string | null) {
    if (sendingSos) {
      return;
    }
    if (profile?.emergency_sos_enabled === false) {
      showAlert('Emergency SOS is disabled', 'Enable Emergency SOS in Settings to use this feature.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/modal') },
      ]);
      return;
    }
    showAlert(
      'Send emergency SOS?',
      "This immediately alerts PartyUp Guild Leaders and your trusted circle, and shares your live location until you tap \"I'm safe\".",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: () => void sendSos(tripId) },
      ]
    );
  }

  return { requestSos, sendingSos };
}
