import IdCameraCapture from '@/components/IdCameraCapture';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { submitVehicleForVerification, type VehicleOwnershipType } from '@/lib/vehicles';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CheckCircle2, Car, FileText, IdCard, PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function UploadTile({ label, uri, onPress, icon }: { label: string; uri: string | null; onPress: () => void; icon: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} className="items-center gap-2 rounded-[20px] border border-dashed border-[#B9C4DA] bg-[#F7F8FC] p-4">
      {uri ? (
        <Image source={{ uri }} className="h-32 w-full rounded-2xl" resizeMode="cover" />
      ) : (
        <View className="h-32 w-full items-center justify-center gap-2">
          {icon}
          <Text className="text-[15px] font-semibold text-[#6B7590]">{label}</Text>
        </View>
      )}
      {uri && <Text className="text-[14px] font-semibold text-[#2747C7]">Change {label.toLowerCase()}</Text>}
    </TouchableOpacity>
  );
}

type CaptureTarget = 'exterior' | 'orcr' | 'plate' | 'authorizationLetter' | 'ownerIdFront' | 'ownerIdBack' | 'ownerSignatures';

const CAPTURE_TITLES: Record<CaptureTarget, string> = {
  exterior: 'Fit your vehicle inside the frame',
  orcr: 'Fit your OR/CR inside the frame',
  plate: 'Fit your plate inside the frame',
  authorizationLetter: 'Fit the letter of authorization inside the frame',
  ownerIdFront: "Fit the front of the owner's ID inside the frame",
  ownerIdBack: "Fit the back of the owner's ID inside the frame",
  ownerSignatures: "Fit the owner's 3 signatures inside the frame",
};

export default function VerifyVehicleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { titleColor, subtitleColor } = getTheme(isDark);
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();

  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType>('owned');
  const [photos, setPhotos] = useState<Partial<Record<CaptureTarget, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<CaptureTarget | null>(null);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!vehicleId) {
    return <Redirect href="/vehicles" />;
  }

  const { exterior, orcr, plate, authorizationLetter, ownerIdFront, ownerIdBack, ownerSignatures } = photos;
  const isBorrowed = ownershipType === 'borrowed';
  const hasVehiclePhotos = Boolean(exterior && orcr && plate);
  const hasOwnerDocuments = Boolean(authorizationLetter && ownerIdFront && ownerIdBack && ownerSignatures);
  const canSubmit = hasVehiclePhotos && (!isBorrowed || hasOwnerDocuments) && !submitting;

  const handleSubmit = async () => {
    if (!exterior || !orcr || !plate) {
      return;
    }
    if (isBorrowed && (!authorizationLetter || !ownerIdFront || !ownerIdBack || !ownerSignatures)) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await submitVehicleForVerification(vehicleId, {
      exteriorUri: exterior,
      orcrUri: orcr,
      plateUri: plate,
      ownershipType,
      borrowed:
        isBorrowed && authorizationLetter && ownerIdFront && ownerIdBack && ownerSignatures
          ? {
              authorizationLetterUri: authorizationLetter,
              ownerIdFrontUri: ownerIdFront,
              ownerIdBackUri: ownerIdBack,
              ownerSignaturesUri: ownerSignatures,
            }
          : undefined,
    });

    setSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }

    Alert.alert(
      'Verification submitted',
      "Our staff will review your vehicle documents and notify you once it's done.",
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]'}`}>
      <View
        className={`border-b px-4 pb-5 ${isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white'}`}
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className={`${typography.pageTitle} ${titleColor}`}>Verify Your Vehicle</Text>
            <Text className={`mt-2 text-[16px] leading-6 ${subtitleColor}`}>Upload photos of your vehicle, OR/CR, and plate to unlock carpool trips. Borrowing? We'll also need the owner's authorization.</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-black/10">
            <Text className="text-[22px] text-[#6B7590]">×</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerClassName="pb-10">
        <View className="rounded-[22px] border border-[#E2E7F0] bg-white p-4 shadow-sm shadow-black/5">
          <Text className="text-[14px] font-extrabold tracking-wide text-[#6B7590]">WHO OWNS THIS VEHICLE?</Text>
          <View className="mt-2 flex-row gap-2 rounded-2xl bg-[#F1F4FA] p-1">
            {(
              [
                { value: 'owned', label: 'I own it' },
                { value: 'borrowed', label: 'Borrowed' },
              ] as const
            ).map((option) => {
              const selected = ownershipType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setOwnershipType(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`flex-1 items-center rounded-xl py-3 ${selected ? 'bg-[#2747C7]' : ''}`}
                >
                  <Text className={`text-[16px] font-bold ${selected ? 'text-white' : 'text-[#6B7590]'}`}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="mt-4 gap-4">
            <UploadTile
              label="Vehicle photo"
              uri={exterior ?? null}
              onPress={() => setActiveCapture('exterior')}
              icon={<Car size={28} color="#6B7590" />}
            />
            <UploadTile
              label="OR/CR"
              uri={orcr ?? null}
              onPress={() => setActiveCapture('orcr')}
              icon={<FileText size={28} color="#6B7590" />}
            />
            <UploadTile
              label="Plate photo"
              uri={plate ?? null}
              onPress={() => setActiveCapture('plate')}
              icon={<Camera size={28} color="#6B7590" />}
            />
          </View>

          {isBorrowed && (
            <View className="mt-6 gap-4">
              <View>
                <Text className="text-[17px] font-bold text-[#1B2340]">Owner's authorization</Text>
                <Text className="mt-1 text-[14px] leading-5 text-[#6B7590]">
                  Since you're borrowing this vehicle, upload a letter of authorization from the registered owner, both sides of their valid ID, and a photo of their signature signed 3 times.
                </Text>
              </View>
              <UploadTile
                label="Letter of authorization"
                uri={authorizationLetter ?? null}
                onPress={() => setActiveCapture('authorizationLetter')}
                icon={<FileText size={28} color="#6B7590" />}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <UploadTile
                    label="Owner ID (front)"
                    uri={ownerIdFront ?? null}
                    onPress={() => setActiveCapture('ownerIdFront')}
                    icon={<IdCard size={28} color="#6B7590" />}
                  />
                </View>
                <View className="flex-1">
                  <UploadTile
                    label="Owner ID (back)"
                    uri={ownerIdBack ?? null}
                    onPress={() => setActiveCapture('ownerIdBack')}
                    icon={<IdCard size={28} color="#6B7590" />}
                  />
                </View>
              </View>
              <UploadTile
                label="Owner's 3 signatures"
                uri={ownerSignatures ?? null}
                onPress={() => setActiveCapture('ownerSignatures')}
                icon={<PenLine size={28} color="#6B7590" />}
              />
            </View>
          )}

          {error && (
            <View className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3">
              <Text className="text-[15px] text-[#B3261E]">{error}</Text>
            </View>
          )}

          <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-[#EEF2FF] px-4 py-3">
            <CheckCircle2 size={18} color="#2747C7" />
            <Text className="flex-1 text-[14px] leading-5 text-[#3646A0]">Your vehicle documents are only visible to PartyUp staff for review.</Text>
          </View>

          <TouchableOpacity
            disabled={!canSubmit}
            onPress={handleSubmit}
            className={`mt-6 items-center rounded-2xl py-4 ${canSubmit ? 'bg-[#2747C7]' : 'bg-[#C6CEDC]'}`}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-[17px] font-bold text-white">Submit for Verification</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <IdCameraCapture
        visible={activeCapture !== null}
        title={activeCapture ? CAPTURE_TITLES[activeCapture] : ''}
        onClose={() => setActiveCapture(null)}
        onCapture={(uri) => {
          if (activeCapture) {
            const target = activeCapture;
            setPhotos((current) => ({ ...current, [target]: uri }));
          }
          setActiveCapture(null);
        }}
      />
    </View>
  );
}
