import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, enterFromBelow, SkeletonCard } from '@/components/ui/motion';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getVehiclePhotoUrl,
  listPendingVehicleVerifications,
  reviewVehicleVerification,
  type PendingVehicleVerification,
} from '@/lib/vehicles';
import { useFocusEffect, useRouter } from 'expo-router';
import { BadgeCheck, Check, ShieldQuestion, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function VehicleImage({ path, label, isDark }: { path: string | null; label: string; isDark: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!path) {
        setLoading(false);
        return;
      }
      setLoading(true);
      void getVehiclePhotoUrl(path).then((signedUrl) => {
        if (!cancelled) {
          setUrl(signedUrl);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [path])
  );

  if (!path) {
    return null;
  }

  return (
    <View className="flex-1 gap-1.5">
      <Text className={`text-xs font-bold ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>{label}</Text>
      <View className={`h-28 items-center justify-center overflow-hidden rounded-xl ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F6FB]'}`}>
        {loading ? <ActivityIndicator color="#2A55D4" /> : url ? <Image source={{ uri: url }} className="h-full w-full" resizeMode="cover" /> : null}
      </View>
    </View>
  );
}

export default function VehicleReviewScreen() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F4F6FB]';

  const [pending, setPending] = useState<PendingVehicleVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Verification reviews are an admin job.
  const isStaff = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await listPendingVehicleVerifications();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setPending(result.data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isStaff) {
        void load();
      }
    }, [isStaff, load])
  );

  async function handleApprove(id: string) {
    setBusyId(id);
    const { error } = await reviewVehicleVerification(id, 'approved');
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to approve', error.message);
      return;
    }
    setPending((current) => current.filter((row) => row.id !== id));
  }

  function startReject(id: string) {
    setRejectNotes('');
    setRejectingId(id);
  }

  async function confirmReject() {
    if (!rejectingId) return;
    setBusyId(rejectingId);
    const { error } = await reviewVehicleVerification(rejectingId, 'rejected', rejectNotes.trim() || undefined);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to reject', error.message);
      return;
    }
    setPending((current) => current.filter((row) => row.id !== rejectingId));
    setRejectingId(null);
  }

  if (authLoading) {
    return null;
  }

  if (!isStaff) {
    return (
      <View className={`flex-1 items-center justify-center px-8 ${background}`} style={{ paddingTop: insets.top }}>
        <ShieldQuestion size={40} color="#6C7A95" />
        <Text className={`mt-4 text-center text-headline-18 font-bold ${primary}`}>Admins only</Text>
        <Text className={`mt-2 text-center text-base ${secondary}`}>Verification reviews are handled by PartyUp admins.</Text>
        <AnimatedPressable onPress={() => router.back()} className="mt-6 rounded-2xl bg-[#2A55D4] px-6 py-3">
          <Text className="font-bold text-white">Go back</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View className={`flex-1 ${background}`}>
      <ScreenHeader title="Vehicle Verification Review" subtitle={!loading ? `${pending.length} pending` : undefined} />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <View key="loading" className="gap-4">
            <SkeletonCard height={230} />
            <SkeletonCard height={230} />
          </View>
        ) : pending.length === 0 ? (
          <EmptyState
            key="empty"
            icon={<BadgeCheck size={34} color="#19A06B" />}
            title="All caught up"
            message="No pending vehicle verifications to review right now."
          />
        ) : (
          pending.map((row, index) => (
            <Animated.View
              key={row.id}
              entering={enterFromBelow(index)}
              exiting={FadeOutLeft.duration(250)}
              layout={LinearTransition.duration(250)}
              className={`gap-3 rounded-[22px] border p-4 shadow-sm ${card} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className={`text-base font-black ${primary}`}>{row.display_name}</Text>
                  <Text className={`text-sm ${secondary}`}>
                    {row.make} {row.model} {row.year ? `(${row.year})` : ''}
                  </Text>
                  {row.plate_number ? <Text className={`text-sm ${secondary}`}>Plate: {row.plate_number}</Text> : null}
                </View>
                <View className={`rounded-full px-3 py-1 ${row.ownership_type === 'borrowed' ? 'bg-[#FEF3C7]' : 'bg-[#E0F2EA]'}`}>
                  <Text className={`text-xs font-bold ${row.ownership_type === 'borrowed' ? 'text-[#92400E]' : 'text-[#146C4A]'}`}>
                    {row.ownership_type === 'borrowed' ? 'Borrowed' : 'Owned'}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2">
                <VehicleImage path={row.exterior_image_path} label="Vehicle" isDark={isDark} />
                <VehicleImage path={row.orcr_image_path} label="OR/CR" isDark={isDark} />
                <VehicleImage path={row.plate_image_path} label="Plate" isDark={isDark} />
              </View>

              {row.ownership_type === 'borrowed' ? (
                <>
                  <Text className={`text-sm font-bold ${primary}`}>Owner's authorization</Text>
                  <View className="flex-row gap-2">
                    <VehicleImage path={row.authorization_letter_path} label="Authorization letter" isDark={isDark} />
                    <VehicleImage path={row.owner_signatures_path} label="3 signatures" isDark={isDark} />
                  </View>
                  <View className="flex-row gap-2">
                    <VehicleImage path={row.owner_id_front_path} label="Owner ID (front)" isDark={isDark} />
                    <VehicleImage path={row.owner_id_back_path} label="Owner ID (back)" isDark={isDark} />
                  </View>
                </>
              ) : null}

              {rejectingId === row.id ? (
                <View className="gap-2">
                  <TextInput
                    className={`rounded-2xl px-4 py-3 text-sm ${inputBg} ${primary}`}
                    placeholder="Reason for rejection (optional)"
                    placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                    value={rejectNotes}
                    onChangeText={setRejectNotes}
                    multiline
                  />
                  <View className="flex-row gap-2">
                    <AnimatedPressable onPress={() => setRejectingId(null)} className={`flex-1 items-center rounded-2xl border py-3 ${border}`}>
                      <Text className={`font-bold ${primary}`}>Cancel</Text>
                    </AnimatedPressable>
                    <AnimatedPressable onPress={() => void confirmReject()} disabled={busyId === row.id} className="flex-1 items-center rounded-2xl bg-[#E32727] py-3">
                      {busyId === row.id ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Confirm Reject</Text>}
                    </AnimatedPressable>
                  </View>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <AnimatedPressable
                    onPress={() => startReject(row.id)}
                    disabled={busyId === row.id}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-[#E32727] py-3"
                  >
                    <X size={16} color="#E32727" />
                    <Text className="font-bold text-[#E32727]">Reject</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => void handleApprove(row.id)}
                    disabled={busyId === row.id}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#19A06B] py-3"
                  >
                    {busyId === row.id ? <ActivityIndicator color="#FFFFFF" /> : <Check size={16} color="#FFFFFF" />}
                    <Text className="font-bold text-white">Approve</Text>
                  </AnimatedPressable>
                </View>
              )}
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
