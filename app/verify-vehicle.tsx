import IdCameraCapture from '@/components/IdCameraCapture';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn, SuccessOverlay, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import {
  getMyDriverLicense,
  hasVerifiedIdLicense,
  isLicenseExpired,
  reuseVerifiedIdAsLicense,
  submitDriverLicense,
  submitVehicleForVerification,
  type DriverLicense,
  type VehicleOwnershipType,
} from '@/lib/vehicles';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CheckCircle2, Car, FileText, IdCard, PenLine } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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
          <Animated.View entering={riseIn(0, 300)} className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-[#10B981]">
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

type CaptureTarget =
  | 'exterior'
  | 'orcr'
  | 'plate'
  | 'authorizationLetter'
  | 'ownerIdFront'
  | 'ownerIdBack'
  | 'ownerSignatures'
  | 'licenseFront'
  | 'licenseBack';

const CAPTURE_TITLES: Record<CaptureTarget, string> = {
  exterior: 'Fit your vehicle inside the frame',
  orcr: 'Fit your OR/CR inside the frame',
  plate: 'Fit your plate inside the frame',
  authorizationLetter: 'Fit the letter of authorization inside the frame',
  ownerIdFront: "Fit the front of the owner's ID inside the frame",
  ownerIdBack: "Fit the back of the owner's ID inside the frame",
  ownerSignatures: "Fit the owner's 3 signatures inside the frame",
  licenseFront: "Fit the front of your driver's license inside the frame",
  licenseBack: "Fit the back of your driver's license inside the frame",
};

function formatExpiry(date: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VerifyVehicleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  // licenseOnly: just add the driver's license (e.g. drivers whose car was
  // approved before licenses were required).
  const { vehicleId, licenseOnly } = useLocalSearchParams<{ vehicleId?: string; licenseOnly?: string }>();
  const isLicenseOnly = licenseOnly === '1';

  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType>('owned');
  const [photos, setPhotos] = useState<Partial<Record<CaptureTarget, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<CaptureTarget | null>(null);
  // Driver's license: one per person, reused across vehicles.
  const [license, setLicense] = useState<DriverLicense | null>(null);
  const [idIsLicense, setIdIsLicense] = useState(false);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
  const [reusingLicense, setReusingLicense] = useState(false);
  // QR on the back of the license, read live while photographing the back
  // (or scanned alone when reusing a verified-ID license).
  const [licenseQr, setLicenseQr] = useState<string | null>(null);
  const [scanningReuseQr, setScanningReuseQr] = useState(false);

  const loadLicense = useCallback(async () => {
    const [{ data }, verifiedIdIsLicense] = await Promise.all([getMyDriverLicense(), hasVerifiedIdLicense()]);
    setLicense(data);
    setIdIsLicense(verifiedIdIsLicense);
    setLicenseLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLicense();
    }, [loadLicense])
  );
  const { style: shakeStyle, shake } = useShake();
  // Document photos taken but not sent yet: ask before leaving.
  useUnsavedChangesGuard(!submitted && Object.values(photos).some(Boolean), {
    message: "Your photos aren't sent yet. If you leave, you'll need to take them again.",
  });
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

  if (!vehicleId && !isLicenseOnly) {
    return <Redirect href="/vehicles" />;
  }

  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6B7590]';
  const iconColor = isDark ? '#94A3B8' : '#6B7590';

  const { exterior, orcr, plate, authorizationLetter, ownerIdFront, ownerIdBack, ownerSignatures, licenseFront, licenseBack } = photos;
  const isBorrowed = ownershipType === 'borrowed';
  // A pending or valid approved license is already on file; a rejected or
  // expired one has to be replaced.
  const licenseOnFile = !!license && license.status !== 'rejected' && !isLicenseExpired(license);
  const needsLicensePhotos = licenseLoaded && !licenseOnFile;
  const hasLicense = licenseOnFile || Boolean(licenseFront && licenseBack && licenseQr);
  const hasVehiclePhotos = isLicenseOnly || Boolean(exterior && orcr && plate);
  const hasOwnerDocuments = Boolean(authorizationLetter && ownerIdFront && ownerIdBack && ownerSignatures);
  const canSubmit =
    licenseLoaded && hasLicense && hasVehiclePhotos && (isLicenseOnly || !isBorrowed || hasOwnerDocuments) && !submitting && !(isLicenseOnly && licenseOnFile);

  const licenseTargets: CaptureTarget[] = needsLicensePhotos ? ['licenseFront', 'licenseBack'] : [];
  const requiredTargets: CaptureTarget[] = isLicenseOnly
    ? licenseTargets
    : [
        ...licenseTargets,
        ...(isBorrowed
          ? (['exterior', 'orcr', 'plate', 'authorizationLetter', 'ownerIdFront', 'ownerIdBack', 'ownerSignatures'] as CaptureTarget[])
          : (['exterior', 'orcr', 'plate'] as CaptureTarget[])),
      ];
  const capturedCount = requiredTargets.filter((target) => photos[target]).length;
  const progress = requiredTargets.length ? capturedCount / requiredTargets.length : 1;

  const handleReuseLicense = async (qrData: string) => {
    setScanningReuseQr(false);
    setReusingLicense(true);
    setError(null);
    const { error: reuseError } = await reuseVerifiedIdAsLicense(qrData);
    setReusingLicense(false);
    if (reuseError) {
      setError(reuseError.message);
      shake();
      return;
    }
    await loadLicense();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    if (!licenseOnFile) {
      if (!licenseFront || !licenseBack || !licenseQr) {
        setSubmitting(false);
        return;
      }
      const { error: licenseError } = await submitDriverLicense(licenseFront, licenseBack, licenseQr);
      if (licenseError) {
        setSubmitting(false);
        setError(licenseError.message);
        shake();
        return;
      }
      await loadLicense();
    }

    if (isLicenseOnly || !vehicleId) {
      setSubmitting(false);
      setSubmitted(true);
      return;
    }

    if (!exterior || !orcr || !plate) {
      setSubmitting(false);
      return;
    }
    if (isBorrowed && (!authorizationLetter || !ownerIdFront || !ownerIdBack || !ownerSignatures)) {
      setSubmitting(false);
      return;
    }

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
      <ScreenHeader
        title={isLicenseOnly ? "Driver's License" : 'Verify Your Vehicle'}
        subtitle={isLicenseOnly ? 'Needed to create carpools' : 'Unlock carpool trips in a few photos'}>
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
        <Card index={0} className="gap-3">
          <View>
            <Text className={`text-[16px] font-bold ${primary}`}>Your driver&apos;s license</Text>
            <Text className={`mt-1 text-[14px] leading-5 ${secondary}`}>
              Whoever drives needs a valid license, even on a borrowed car. You only add it once for all your vehicles.
            </Text>
          </View>
          {!licenseLoaded ? (
            <ActivityIndicator color="#2747C7" />
          ) : licenseOnFile ? (
            <View className={`flex-row items-center gap-2 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#0F1F24]' : 'bg-[#F1FBF5]'}`}>
              <CheckCircle2 size={18} color="#10B981" />
              <Text className={`flex-1 text-[14px] ${primary}`}>
                {license?.status === 'approved' ? 'License verified' : 'License submitted, waiting for review'}
                {license?.expiry_date ? ` · expires ${formatExpiry(license.expiry_date)}` : ''}
              </Text>
            </View>
          ) : (
            <>
              {license?.status === 'rejected' ? (
                <Text className="text-[14px] text-[#B3261E]">
                  Your last license photos were rejected{license.reviewer_notes ? `: ${license.reviewer_notes}` : ''}. Please retake them.
                </Text>
              ) : isLicenseExpired(license) ? (
                <Text className="text-[14px] text-[#B3261E]">Your license on file has expired. Add your renewed license.</Text>
              ) : null}
              {idIsLicense && license?.source !== 'id_verification' ? (
                <AnimatedPressable
                  onPress={() => setScanningReuseQr(true)}
                  disabled={reusingLicense}
                  className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#2747C7] py-3.5">
                  {reusingLicense ? <ActivityIndicator color="#FFFFFF" /> : <IdCard size={18} color="#FFFFFF" />}
                  <Text className="text-[15px] font-bold text-white">Use my verified driver&apos;s license</Text>
                </AnimatedPressable>
              ) : null}
              {idIsLicense && license?.source !== 'id_verification' ? (
                <Text className={`text-center text-[13px] ${secondary}`}>
                  You verified your ID with a driver&apos;s license. Just scan the QR code on its back. Or take new photos below.
                </Text>
              ) : null}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <UploadTile label="License (front)" uri={licenseFront ?? null} onPress={() => setActiveCapture('licenseFront')} icon={<IdCard size={26} color={iconColor} />} />
                </View>
                <View className="flex-1">
                  <UploadTile
                    label="License (back)"
                    uri={licenseBack ?? null}
                    onPress={() => {
                      setLicenseQr(null);
                      setActiveCapture('licenseBack');
                    }}
                    icon={<IdCard size={26} color={iconColor} />}
                  />
                </View>
              </View>
              {licenseBack ? (
                <Text className={`text-[13px] font-semibold ${licenseQr ? 'text-[#10B981]' : 'text-[#B3261E]'}`}>
                  {licenseQr ? 'QR code read ✓' : "We couldn't read the QR code. Retake the back with the QR inside the frame."}
                </Text>
              ) : null}
            </>
          )}
        </Card>

        {isLicenseOnly ? null : (
        <>
        <Card index={1}>
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

        <Card index={2} className="gap-4">
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
        </>
        )}

        {error ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]'}`}>
            <Text className={`text-[15px] ${isDark ? 'text-[#F87171]' : 'text-[#B3261E]'}`}>{error}</Text>
          </Animated.View>
        ) : null}

        <View className={`flex-row items-start gap-2 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF2FF]'}`}>
          <CheckCircle2 size={18} color={isDark ? '#8FB0FF' : '#2747C7'} />
          <Text className={`flex-1 text-[14px] leading-5 ${isDark ? 'text-[#C7D4F5]' : 'text-[#3646A0]'}`}>Your documents are only visible to PartyUp admins for review.</Text>
        </View>

        <AnimatedPressable
          disabled={!canSubmit}
          onPress={handleSubmit}
          className="items-center rounded-2xl py-4"
          style={{ backgroundColor: canSubmit ? '#2747C7' : isDark ? '#22324B' : '#C6CEDC' }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-[16px] font-bold text-white">{isLicenseOnly ? 'Submit License' : 'Submit for Verification'}</Text>
          )}
        </AnimatedPressable>
      </ScrollView>

      <IdCameraCapture
        visible={scanningReuseQr}
        title="Scan your license's QR code"
        qrOnly
        scanQr={(data) => void handleReuseLicense(data)}
        onClose={() => setScanningReuseQr(false)}
      />

      <IdCameraCapture
        visible={activeCapture !== null}
        title={activeCapture ? CAPTURE_TITLES[activeCapture] : ''}
        scanQr={activeCapture === 'licenseBack' ? setLicenseQr : undefined}
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
        message={
          isLicenseOnly
            ? "A PartyUp admin will review your driver's license and notify you once it's done."
            : "A PartyUp admin will review your documents and notify you once it's done."
        }
        durationMs={2200}
        onDone={finishSubmitted}
      />
    </View>
  );
}
