import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { assessImageQuality, qualityIssueMessage } from '@/lib/imageQuality';

const RETRY_MESSAGE_MS = 1200;
const INSTRUCTION = 'Center your face in the circle, then tap to take your selfie';

export default function GuidedSelfieCapture({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && !permission?.granted) {
      void requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        setCapturing(false);
        return;
      }

      const quality = await assessImageQuality(photo.uri);
      if (!quality.ok) {
        setRetryMessage(qualityIssueMessage(quality.reason!));
        retryTimeoutRef.current = setTimeout(() => {
          setRetryMessage(null);
          setCapturing(false);
        }, RETRY_MESSAGE_MS);
        return;
      }

      setPreviewUri(photo.uri);
      setCapturing(false);
    } catch {
      setCapturing(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setCapturing(false);
      setPreviewUri(null);
      setRetryMessage(null);
    }
  }, [visible]);

  function handleRetake() {
    setPreviewUri(null);
  }

  function handleUsePhoto() {
    if (previewUri) {
      onCapture(previewUri);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <TouchableOpacity
          onPress={onClose}
          className="absolute right-4 top-14 z-10 h-10 w-10 items-center justify-center rounded-full bg-black/50"
        >
          <X size={20} color="#fff" />
        </TouchableOpacity>

        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-[16px] text-white">Camera access is needed to take your selfie.</Text>
            <TouchableOpacity onPress={() => void requestPermission()} className="rounded-2xl bg-[#2747C7] px-6 py-3">
              <Text className="font-bold text-white">Grant Camera Access</Text>
            </TouchableOpacity>
          </View>
        ) : previewUri ? (
          <View className="flex-1">
            <Image source={{ uri: previewUri }} className="flex-1" resizeMode="contain" />
            <View className="gap-3 px-6 pb-12 pt-4">
              <TouchableOpacity onPress={handleUsePhoto} className="items-center rounded-2xl bg-[#2747C7] py-4">
                <Text className="text-[16px] font-bold text-white">Use This Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRetake} className="items-center rounded-2xl bg-white/15 py-4">
                <Text className="text-[16px] font-bold text-white">Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="flex-1">
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
            <View className="absolute inset-0 items-center justify-center px-8">
              <View className="h-64 w-64 rounded-full border-2 border-white/70" />
            </View>

            <View className="absolute bottom-0 left-0 right-0 items-center gap-4 bg-black/40 px-8 pb-14 pt-8">
              <Text className="text-center text-[18px] font-bold text-white">{retryMessage ?? INSTRUCTION}</Text>
              {capturing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <TouchableOpacity
                  onPress={handleCapture}
                  className="h-16 w-16 items-center justify-center rounded-full border-4 border-white/40 bg-white"
                />
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
