import MunicipalityPicker from '@/components/MunicipalityPicker';
import { FloatingIcon } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { formatResidence, setMyMunicipality, type BulacanMunicipality } from '@/lib/bulacan';
import { supabase } from '@/lib/supabase';
import { getMyVerification } from '@/lib/verification';
import { useFocusEffect, useRouter } from 'expo-router';
import { Clock, MapPin, ShieldAlert, ShieldX } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every traveler must have an approved ID before using the app. The root
// layout redirects unverified travelers here from any other screen, and back
// to the tabs once staff approve them.
export default function VerificationRequiredScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { screenBackground, titleColor, subtitleColor, warningColor, destructiveColor } = getTheme(isDark);
  const { profile, refreshProfile, signOut } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState<string | null>(null);
  const [showMunicipalityPicker, setShowMunicipalityPicker] = useState(false);
  const [savingMunicipality, setSavingMunicipality] = useState(false);

  const status = profile?.verification_status ?? 'unverified';
  const city = profile?.city ?? null;
  // Checked against the ID address at review, so editable until approved.
  const canChangeCity = !city || status === 'unverified' || status === 'rejected';

  async function handleSelectMunicipality(selected: BulacanMunicipality) {
    if (!profile) {
      return;
    }
    setSavingMunicipality(true);
    const { error } = await setMyMunicipality(profile.id, selected);
    await refreshProfile();
    setSavingMunicipality(false);
    if (error) {
      Alert.alert('Could not save', error.message);
    }
  }

  const checkStatus = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  // Staff review happens elsewhere; pick up a decision when the user returns
  // to the app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshProfile();
      }
    });
    return () => subscription.remove();
  }, [refreshProfile]);

  // A review decision arrives as a notification row, so refresh the moment
  // one lands; VerificationGate then moves an approved traveler into the app.
  const userId = profile?.id;
  useEffect(() => {
    if (!userId) {
      return;
    }
    const channel = supabase
      .channel(`verification-decision:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void refreshProfile();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshProfile]);

  useEffect(() => {
    if (status !== 'rejected') {
      return;
    }
    let cancelled = false;
    getMyVerification().then(({ data }) => {
      if (!cancelled) {
        setReviewerNotes(data?.reviewer_notes ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const visibleReviewerNotes = status === 'rejected' ? reviewerNotes : null;

  const content = !city
    ? {
        icon: <MapPin size={44} color={warningColor} />,
        title: 'Where in Bulacan do you live?',
        body: 'PartyUp is currently for Bulacan residents. You can still travel anywhere. Your ID must show this address.',
      }
    : status === 'pending'
      ? {
          icon: <Clock size={44} color={warningColor} />,
          title: 'Your ID is under review',
          body: "Thanks for submitting your documents. Our staff usually review them within 1-2 hours. We'll notify you once you're approved.",
        }
      : status === 'rejected'
        ? {
            icon: <ShieldX size={44} color={destructiveColor} />,
            title: 'Your ID verification was rejected',
            body: 'Please resubmit clear photos of a valid government ID and a selfie to continue.',
          }
        : {
            icon: <ShieldAlert size={44} color={warningColor} />,
            title: 'Verify your identity',
            body: 'To keep every traveler safe, PartyUp requires a verified government ID before you can use the app. It only takes a few minutes.',
          };

  return (
    <View className={`flex-1 ${screenBackground}`} style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <FloatingIcon>{content.icon}</FloatingIcon>
        <Text className={`text-center ${typography.pageTitle} ${titleColor}`}>{content.title}</Text>
        <Text className={`text-center text-base leading-6 ${subtitleColor}`}>{content.body}</Text>

        {visibleReviewerNotes ? (
          <View className="w-full rounded-2xl bg-[#FDECEC] px-4 py-3">
            <Text className="text-sm font-semibold text-[#B3261E]">Reviewer notes</Text>
            <Text className="mt-1 text-sm leading-5 text-[#B3261E]">{visibleReviewerNotes}</Text>
          </View>
        ) : null}

        {city ? (
          <View className="w-full flex-row items-center justify-center gap-2">
            <MapPin size={16} color="#6C7A95" />
            <Text className={`text-base ${subtitleColor}`}>{formatResidence(city)}</Text>
            {canChangeCity ? (
              <TouchableOpacity onPress={() => setShowMunicipalityPicker(true)} disabled={savingMunicipality}>
                <Text className="text-base font-semibold text-[#2A55D4]">Change</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!city ? (
          <TouchableOpacity
            onPress={() => setShowMunicipalityPicker(true)}
            disabled={savingMunicipality}
            className="mt-2 w-full items-center rounded-2xl bg-[#2A55D4] py-4"
          >
            {savingMunicipality ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Select City / Municipality</Text>}
          </TouchableOpacity>
        ) : status === 'pending' ? (
          <TouchableOpacity
            onPress={checkStatus}
            disabled={refreshing}
            className="mt-2 w-full items-center rounded-2xl bg-[#2A55D4] py-4"
          >
            {refreshing ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Check Status</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.push('/verify-id')} className="mt-2 w-full items-center rounded-2xl bg-[#2A55D4] py-4">
            <Text className="text-base font-bold text-white">{status === 'rejected' ? 'Resubmit Documents' : 'Verify Now'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <MunicipalityPicker
        visible={showMunicipalityPicker}
        selected={city}
        onSelect={(selected) => void handleSelectMunicipality(selected)}
        onClose={() => setShowMunicipalityPicker(false)}
      />

      <TouchableOpacity onPress={() => void signOut()} className="items-center py-3">
        <Text className={`text-base font-semibold ${subtitleColor}`}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
