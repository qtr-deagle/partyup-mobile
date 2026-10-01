import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Fullscreen view of a chat photo. Tap anywhere or ✕ to close.
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={uri !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 bg-black" onPress={onClose}>
        {uri ? (
          <Animated.View key="photo-viewer" entering={FadeIn.duration(200)} className="flex-1">
            <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" transition={150} />
          </Animated.View>
        ) : null}
        <View className="absolute right-4" style={{ top: insets.top + 12 }}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close photo" hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}
