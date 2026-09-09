import GuidedSelfieCapture from '@/components/GuidedSelfieCapture';
import IdCameraCapture from '@/components/IdCameraCapture';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { submitIdVerification, type DocumentType } from '@/lib/verification';
import { Redirect, useRouter } from 'expo-router';
import { Camera, CheckCircle2, IdCard, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const documentOptions: { label: string; value: DocumentType; needsBack: boolean }[] = [
  { label: 'Passport', value: 'passport', needsBack: false },
  { label: "Driver's License", value: 'driver_license', needsBack: true },
  { label: 'National ID', value: 'national_id', needsBack: true },
  { label: 'Other Government ID', value: 'other', needsBack: true },
];

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

export default function VerifyIdScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { titleColor, subtitleColor } = getTheme(isDark);

  const [documentType, setDocumentType] = useState<DocumentType>('passport');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<'front' | 'back' | 'selfie' | null>(null);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const selectedOption = documentOptions.find((option) => option.value === documentType)!;
  const canSubmit = Boolean(frontUri && selfieUri && (!selectedOption.needsBack || backUri) && !submitting);

  const handleSubmit = async () => {
    if (!frontUri || !selfieUri) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await submitIdVerification({
      documentType,
      frontUri,
      backUri: selectedOption.needsBack ? backUri ?? undefined : undefined,
      selfieUri,
    });

    setSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }

    Alert.alert(
      'Verification submitted',
      "We'll run an automatic pre-check and our staff will review your documents and notify you once it's done.",
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
            <Text className={`${typography.pageTitle} ${titleColor}`}>Verify Your Identity</Text>
            <Text className={`mt-2 text-[16px] leading-6 ${subtitleColor}`}>Upload a government ID and a selfie to unlock trip creation.</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-black/10">
            <Text className="text-[22px] text-[#6B7590]">×</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerClassName="pb-10">
        <View className="rounded-[22px] border border-[#E2E7F0] bg-white p-4 shadow-sm shadow-black/5">
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
            <Text className="flex-1 text-[14px] leading-5 text-[#3646A0]">Your documents are only visible to PartyUp staff for review.</Text>
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
    </View>
  );
}
