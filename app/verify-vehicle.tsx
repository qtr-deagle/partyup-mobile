import IdCameraCapture from '@/components/IdCameraCapture';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { SuccessOverlay, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { submitVehicleForVerification, type VehicleOwnershipType } from '@/lib/vehicles';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CheckCircle2, Car, FileText, IdCard, PenLine } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function UploadTile({ label, uri, onPress, icon }: { label: string; uri: string | null; onPress: () => void; icon: React.ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  const captured = Boolean(uri);
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.98}
      className={`items-center gap-2 rounded-[20px] border p-3 ${
        captured
          ? isDark ? 'border-[#1F5C45] bg-[#0F1F24]' : 'border-[#A7E3C4] bg-[#F1FBF5]'
          : `border-dashed ${isDark ? 'border-[#33476A] bg-[#18253C]' : 'border-[#B9C4DA] bg-[#F7F8FC]'}`
      }`}
    >
      {uri ? (
        <View className="w-full">
          <Image source={{ uri }} className="h-32 w-full rounded-2xl" resizeMode="cover" />
          <Animated.View entering={ZoomIn.springify().damping(12)} className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-[#10B981]">
            <CheckCircle2 size={18} color="#FFFFFF" />
          </Animated.View>
        </View>
      ) : (
        <View className="h-32 w-full items-center justify-center gap-2">
          <View className={`h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-white'}`}>{icon}</View>
          <Text className={`text-center text-[14px] font-semibold ${isDark ? 'text-[#CBD5E1]' : 'text-[#6B7590]'}`}>{label}</Text>
          <Text className={`text-[12px] ${isDark ? 'text-[#64748B]' : 'text-[#A1A8B8]'}`}>Tap to capture</Text>
        </View>
      )}
      {uri ? <Text className="text-[13px] font-semibold text-[#2747C7]">Retake {label.toLowerCase()}</Text> : null}
    </AnimatedPressable>
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
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();

  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType>('owned');
  const [photos, setPhotos] = useState<Partial<Record<CaptureTarget, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<CaptureTarget | null>(null);
  const { style: shakeStyle, shake } = useShake();
  const finishSubmitted = useCallback(() => {
    setSubmitted(false);
    router.back();
  }, [router]);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!vehicleId) {
    return <Redirect href="/vehicles" />;
  }

  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6B7590]';
  const iconColor = isDark ? '#94A3B8' : '#6B7590';

  const { exterior, orcr, plate, authorizationLetter, ownerIdFront, ownerIdBack, ownerSignatures } = photos;
  const isBorrowed = ownershipType === 'borrowed';
  const hasVehiclePhotos = Boolean(exterior && orcr && plate);
  const hasOwnerDocuments = Boolean(authorizationLetter && ownerIdFront && ownerIdBack && ownerSignatures);
  const canSubmit = hasVehiclePhotos && (!isBorrowed || hasOwnerDocuments) && !submitting;

  const requiredTargets: CaptureTarget[] = isBorrowed
    ? ['exterior', 'orcr', 'plate', 'authorizationLetter', 'ownerIdFront', 'ownerIdBack', 'ownerSignatures']
    : ['exterior', 'orcr', 'plate'];
  const capturedCount = requiredTargets.filter((target) => photos[target]).length;
  const progress = capturedCount / requiredTargets.length;

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
      shake();
      return;
    }

    setSubmitted(true);
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]'}`}>
      <ScreenHeader title="Verify Your Vehicle" subtitle="Unlock carpool trips in a few photos">
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className={`text-[13px] font-semibold ${secondary}`}>Documents captured</Text>
            <Text className={`text-[13px] font-bold ${primary}`}>
              {capturedCount}/{requiredTargets.length}
            </Text>
          </View>
          <View className={`mt-2 h-2 overflow-hidden rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#E6EBF3]'}`}>
            <Animated.View
              className={`h-full rounded-full ${progress === 1 ? 'bg-[#10B981]' : 'bg-[#2747C7]'}`}
              style={{ width: `${progress * 100}%`, transitionProperty: 'width', transitionDuration: 350 }}
            />
          </View>
        </View>
      </ScreenHeader>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Card index={0}>
          <Text className={`text-[13px] font-extrabold tracking-wide ${secondary}`}>WHO OWNS THIS VEHICLE?</Text>
          <View className={`mt-2 flex-row gap-2 rounded-2xl p-1 ${isDark ? 'bg-[#18253C]' : 'bg-[#F1F4FA]'}`}>
            {(
              [
                { value: 'owned', label: 'I own it' },
                { value: 'borrowed', label: 'Borrowed' },
              ] as const
            ).map((option) => {
              const selected = ownershipType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setOwnershipType(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: selected ? '#2747C7' : 'transparent' }}
                >
                  <Text className="text-[15px] font-bold" style={{ color: selected ? '#FFFFFF' : iconColor }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className={`mt-3 text-[14px] leading-5 ${secondary}`}>
            Upload photos of your vehicle, OR/CR, and plate. Borrowing? We&apos;ll also need the owner&apos;s authorization.
          </Text>
        </Card>

        <Card index={1} className="gap-4">
          <Text className={`text-[16px] font-bold ${primary}`}>Vehicle documents</Text>
          <UploadTile label="Vehicle photo" uri={exterior ?? null} onPress={() => setActiveCapture('exterior')} icon={<Car size={26} color={iconColor} />} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <UploadTile label="OR/CR" uri={orcr ?? null} onPress={() => setActiveCapture('orcr')} icon={<FileText size={26} color={iconColor} />} />
            </View>
            <View className="flex-1">
              <UploadTile label="Plate photo" uri={plate ?? null} onPress={() => setActiveCapture('plate')} icon={<Camera size={26} color={iconColor} />} />
            </View>
          </View>
        </Card>

        {isBorrowed ? (
          <Animated.View key="owner-docs" entering={FadeInDown.duration(300)}>
            <Card className="gap-4">
              <View>
                <Text className={`text-[16px] font-bold ${primary}`}>Owner&apos;s authorization</Text>
                <Text className={`mt-1 text-[14px] leading-5 ${secondary}`}>
                  Since you&apos;re borrowing this vehicle, upload a letter of authorization from the registered owner, both sides of their valid ID, and a photo of their signature signed 3 times.
                </Text>
              </View>
              <UploadTile
                label="Letter of authorization"
                uri={authorizationLetter ?? null}
                onPress={() => setActiveCapture('authorizationLetter')}
                icon={<FileText size={26} color={iconColor} />}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <UploadTile label="Owner ID (front)" uri={ownerIdFront ?? null} onPress={() => setActiveCapture('ownerIdFront')} icon={<IdCard size={26} color={iconColor} />} />
                </View>
                <View className="flex-1">
                  <UploadTile label="Owner ID (back)" uri={ownerIdBack ?? null} onPress={() => setActiveCapture('ownerIdBack')} icon={<IdCard size={26} color={iconColor} />} />
                </View>
              </View>
              <UploadTile
                label="Owner's 3 signatures"
                uri={ownerSignatures ?? null}
                onPress={() => setActiveCapture('ownerSignatures')}
                icon={<PenLine size={26} color={iconColor} />}
              />
            </Card>
          </Animated.View>
        ) : null}

        {error ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]'}`}>
            <Text className={`text-[15px] ${isDark ? 'text-[#F87171]' : 'text-[#B3261E]'}`}>{error}</Text>
          </Animated.View>
        ) : null}

        <View className={`flex-row items-start gap-2 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF2FF]'}`}>
          <CheckCircle2 size={18} color={isDark ? '#8FB0FF' : '#2747C7'} />
          <Text className={`flex-1 text-[14px] leading-5 ${isDark ? 'text-[#C7D4F5]' : 'text-[#3646A0]'}`}>Your vehicle documents are only visible to PartyUp staff for review.</Text>
        </View>

        <AnimatedPressable
          disabled={!canSubmit}
          onPress={handleSubmit}
          className="items-center rounded-2xl py-4"
          style={{ backgroundColor: canSubmit ? '#2747C7' : isDark ? '#22324B' : '#C6CEDC' }}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-[16px] font-bold text-white">Submit for Verification</Text>}
        </AnimatedPressable>
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

      <SuccessOverlay
        visible={submitted}
        title="Verification submitted"
        message="Our staff will review your vehicle documents and notify you once it's done."
        durationMs={2200}
        onDone={finishSubmitted}
      />
    </View>
  );
}
