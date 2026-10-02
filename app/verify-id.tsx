import GuidedSelfieCapture from '@/components/GuidedSelfieCapture';
import IdCameraCapture from '@/components/IdCameraCapture';
import LegalNameFields from '@/components/LegalNameFields';
import { legalNameColumns, validateLegalName, type LegalName } from '@/lib/names';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatResidence } from '@/lib/bulacan';
import { getTheme, typography } from '@/lib/theme';
import { SuccessOverlay } from '@/components/ui/motion';
import { feedback } from '@/lib/sounds';
import { submitIdVerification, type DocumentType } from '@/lib/verification';
import { Redirect, useRouter } from 'expo-router';
import { Camera, CheckCircle2, IdCard, MapPin, Upload } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const documentOptions: { label: string; value: DocumentType; needsBack: boolean }[] = [
  { label: 'Passport', value: 'passport', needsBack: false },
  { label: "Driver's License", value: 'driver_license', needsBack: true },
  { label: 'National ID', value: 'national_id', needsBack: true },
  { label: 'Other Government ID', value: 'other', needsBack: true },
];

function UploadTile({ label, uri, onPress, icon }: { label: string; uri: string | null; onPress: () => void; icon: React.ReactNode }) {
  // Preview at the photo's own aspect ratio so the whole ID/selfie is visible
  // for checking (a fixed-height `cover` box cropped the edges). Tall photos
  // are capped and letterboxed by `contain` instead of stretching the form.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setAspectRatio(null);
    if (!uri) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setAspectRatio(width / height);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <TouchableOpacity onPress={onPress} className="items-center gap-2 rounded-[20px] border border-dashed border-[#B9C4DA] bg-[#F7F8FC] p-4">
      {uri ? (
        <Image
          source={{ uri }}
          className="w-full rounded-2xl"
          style={{ aspectRatio: aspectRatio ?? 4 / 3, maxHeight: 360 }}
          resizeMode="contain"
        />
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

export default function VerifyIdScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading, profile, refreshProfile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { titleColor, subtitleColor } = getTheme(isDark);

  const [documentType, setDocumentType] = useState<DocumentType>('national_id');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<'front' | 'back' | 'selfie' | null>(null);
  // null until the user edits, so the form keeps showing the name from
  // sign-up even if the profile finishes loading after this screen mounts.
  const [editedName, setEditedName] = useState<LegalName | null>(null);
  const [editedNoMiddleName, setEditedNoMiddleName] = useState<boolean | null>(null);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const selectedOption = documentOptions.find((option) => option.value === documentType)!;
  const residence = formatResidence(profile?.city);
  const savedName: LegalName | null = profile?.first_name && profile.last_name
    ? { firstName: profile.first_name, middleName: profile.middle_name ?? '', lastName: profile.last_name, suffix: profile.name_suffix ?? '' }
    : null;
  // Pre-filled from sign-up; accounts from before the legal-name fields
  // start empty and have to fill it in.
  const legalName = editedName ?? savedName ?? { firstName: '', middleName: '', lastName: '', suffix: '' };
  const noMiddleName = editedNoMiddleName ?? Boolean(savedName && !savedName.middleName);
  const nameChanged = !savedName || editedName !== null || editedNoMiddleName !== null;
  const nameError = validateLegalName(legalName, noMiddleName);
  const canSubmit = Boolean(residence && !nameError && frontUri && selfieUri && (!selectedOption.needsBack || backUri) && !submitting);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/verification-required');
    }
  };

  const handleSubmit = async () => {
    if (!frontUri || !selfieUri) {
      return;
    }

    setSubmitting(true);
    setError(null);

    if (nameChanged && session) {
      const { error: nameSaveError } = await supabase
        .from('profiles')
        .update(legalNameColumns(legalName, noMiddleName))
        .eq('id', session.user.id);
      if (nameSaveError) {
        setSubmitting(false);
        feedback.error();
        setError(nameSaveError.message);
        return;
      }
    }

    const { error: submitError } = await submitIdVerification({
      documentType,
      frontUri,
      backUri: selectedOption.needsBack ? backUri ?? undefined : undefined,
      selfieUri,
    });

    setSubmitting(false);

    if (submitError) {
      feedback.error();
      setError(submitError.message);
      return;
    }

    await refreshProfile();
    setSubmitted(true);
  };

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]'}`}>
      <View
        className={`border-b px-4 pb-5 ${isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white'}`}
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className={`${typography.pageTitle} ${titleColor}`}>Verify Your Identity</Text>
            <Text className={`mt-2 text-[16px] leading-6 ${subtitleColor}`}>Upload a government ID and a selfie to start using PartyUp.</Text>
          </View>
          <TouchableOpacity onPress={close} className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-black/10">
            <Text className="text-[22px] text-[#6B7590]">×</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View className="rounded-[22px] border border-[#E2E7F0] bg-white p-4 shadow-sm shadow-black/5">
          <View className="mb-5 flex-row items-start gap-2 rounded-2xl bg-[#FFF6E5] px-4 py-3">
            <MapPin size={18} color="#B26A00" />
            <Text className="flex-1 text-[14px] leading-5 text-[#7A4B00]">
              {residence
                ? `Use an ID that shows your address in ${residence} (e.g. PhilSys, driver's license, voter's or postal ID). A passport has no address, so it can't confirm residency on its own.`
                : 'Select your city or municipality in Bulacan before submitting your ID.'}
            </Text>
          </View>
          <View className="mb-6">
            <Text className="mb-3 text-[16px] font-extrabold tracking-wide text-[#6B7590]">YOUR LEGAL NAME</Text>
            <LegalNameFields value={legalName} onChange={setEditedName} noMiddleName={noMiddleName} onNoMiddleNameChange={setEditedNoMiddleName} />
          </View>
          <Text className="text-[16px] font-extrabold tracking-wide text-[#6B7590]">DOCUMENT TYPE</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {documentOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setDocumentType(option.value)}
                className={`rounded-full px-4 py-2.5 ${documentType === option.value ? 'bg-[#2747C7]' : 'bg-[#F3F5FA]'}`}
              >
                <Text className={`text-[15px] font-semibold ${documentType === option.value ? 'text-white' : 'text-[#17233F]'}`}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mt-6 gap-4">
            <UploadTile
              label="Front of ID"
              uri={frontUri}
              onPress={() => setActiveCapture('front')}
              icon={<IdCard size={28} color="#6B7590" />}
            />
            {selectedOption.needsBack && (
              <UploadTile
                label="Back of ID"
                uri={backUri}
                onPress={() => setActiveCapture('back')}
                icon={<Upload size={28} color="#6B7590" />}
              />
            )}
            <UploadTile
              label="Selfie"
              uri={selfieUri}
              onPress={() => setActiveCapture('selfie')}
              icon={<Camera size={28} color="#6B7590" />}
            />
          </View>

          {error && (
            <View className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3">
              <Text className="text-[15px] text-[#B3261E]">{error}</Text>
            </View>
          )}

          <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-[#EEF2FF] px-4 py-3">
            <CheckCircle2 size={18} color="#2747C7" />
            <Text className="flex-1 text-[14px] leading-5 text-[#3646A0]">Your documents are only visible to PartyUp Guild Leaders for review.</Text>
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
      </KeyboardAvoidingView>

      <IdCameraCapture
        visible={activeCapture === 'front'}
        title="Front of your ID"
        onClose={() => setActiveCapture(null)}
        onCapture={(uri) => {
          setFrontUri(uri);
          setActiveCapture(null);
        }}
      />
      <IdCameraCapture
        visible={activeCapture === 'back'}
        title="Back of your ID"
        onClose={() => setActiveCapture(null)}
        onCapture={(uri) => {
          setBackUri(uri);
          setActiveCapture(null);
        }}
      />
      <GuidedSelfieCapture
        visible={activeCapture === 'selfie'}
        onClose={() => setActiveCapture(null)}
        onCapture={(uri) => {
          setSelfieUri(uri);
          setActiveCapture(null);
        }}
      />
      <SuccessOverlay
        visible={submitted}
        title="Verification submitted"
        message="We'll run a quick automatic check, then a Guild Leader will review your documents. You'll get a notification when it's done."
        durationMs={2600}
        onDone={close}
      />
    </View>
  );
}
