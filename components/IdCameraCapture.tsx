import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { assessImageQuality, qualityIssueMessage } from '@/lib/imageQuality';

const RETRY_MESSAGE_MS = 1200;

type Phase = 'aiming' | 'capturing' | 'preview';

export default function IdCameraCapture({
  visible,
  title,
  onClose,
  onCapture,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onCapture: (uri: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('aiming');
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
    setPhase('capturing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        setPhase('aiming');
        return;
      }

      const quality = await assessImageQuality(photo.uri);
      if (!quality.ok) {
        setRetryMessage(qualityIssueMessage(quality.reason!));
        retryTimeoutRef.current = setTimeout(() => {
          setRetryMessage(null);
          setPhase('aiming');
        }, RETRY_MESSAGE_MS);
        return;
      }

      setPreviewUri(photo.uri);
      setPhase('preview');
    } catch {
      setPhase('aiming');
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setPhase('aiming');
      setPreviewUri(null);
      setRetryMessage(null);
    }
  }, [visible]);

  function handleRetake() {
    setPreviewUri(null);
    setPhase('aiming');
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
            <Text className="text-center text-[16px] text-white">Camera access is needed to capture your ID.</Text>
            <TouchableOpacity onPress={() => void requestPermission()} className="rounded-2xl bg-[#2747C7] px-6 py-3">
              <Text className="font-bold text-white">Grant Camera Access</Text>
            </TouchableOpacity>
          </View>
        ) : phase === 'preview' && previewUri ? (
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
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
            <View className="absolute inset-0 items-center justify-center px-8">
              <Text className="mb-6 text-center text-[17px] font-bold text-white" style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 }}>
                {title}
              </Text>
              <View className="aspect-[1.586] w-full max-w-[420px] rounded-2xl border-2 border-white/70">
                <View className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
                <View className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
                <View className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
                <View className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
              </View>
              <Text className="mt-6 text-center text-[14px] text-white/80">
                {retryMessage ?? 'Fit the document inside the frame, then tap to capture'}
              </Text>
            </View>

            <View className="absolute bottom-14 left-0 right-0 items-center">
              {phase === 'capturing' ? (
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
