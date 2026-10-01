import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// How far the on-screen keyboard reaches up from the bottom edge of the screen,
// 0 when hidden. KeyboardAvoidingView misjudges the overlap on edge-to-edge
// Android inside the tab layout, so screens that need their input above the
// keyboard pad by this value instead.
export function useKeyboardHeight() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Android reports the keyboard minus the navigation bar beneath it; add that
  // strip back so the value is measured from the screen's bottom edge like iOS.
  return height > 0 && Platform.OS === 'android' ? height + insets.bottom : height;
}
