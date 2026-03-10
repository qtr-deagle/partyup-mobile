import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

export default function SOSButton() {
  const [isPressed, setIsPressed] = useState(false);

  const handleSOSPress = async () => {
    setIsPressed(true);
    
    // Heavy vibration feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Wait 100ms and do another vibration
    setTimeout(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 100);

    // Alert the user
    Alert.alert(
      'SOS Activated',
      'Emergency contacts have been notified with your location.',
      [
        {
          text: 'Cancel SOS',
          onPress: () => setIsPressed(false),
          style: 'cancel',
        },
        {
          text: 'Contact Emergency',
          onPress: () => {
            // Here you would integrate with actual emergency services
            Alert.alert('Calling Emergency Services...', 'Call initiated');
            setIsPressed(false);
          },
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <View className="items-center">
      <TouchableOpacity
        onPress={handleSOSPress}
        activeOpacity={0.7}
        className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${
          isPressed ? 'bg-red-600' : 'bg-red-500'
        }`}
      >
        <View className="items-center">
          <IconSymbol size={32} name="exclamationmark.circle.fill" color="white" />
          <Text className="text-white text-xs font-bold mt-1">SOS</Text>
        </View>
      </TouchableOpacity>
      <Text className="text-xs text-gray-600 mt-2 text-center">Press for emergency</Text>
    </View>
  );
}
