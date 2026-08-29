import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface Notification {
  id: string;
  type: 'trip' | 'message' | 'match' | 'safety' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionId?: string;
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  isDark?: boolean;
  notifications?: Notification[];
  onNotificationPress?: (notification: Notification) => void;
}

const { width: screenWidth } = Dimensions.get('window');

export default function NotificationModal({
  visible,
  onClose,
  isDark = false,
  notifications = [],
  onNotificationPress
}: NotificationModalProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const slideX = useRef(new Animated.Value(-screenWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);

  useEffect(() => {
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
  }, [notifications]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(slideX, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(slideX, {
        toValue: -screenWidth,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [backdropOpacity, slideX, visible]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'trip':
        return 'paperplane.fill';
      case 'message':
        return 'bubble.right.fill';
      case 'match':
        return 'checkmark.circle.fill';
      case 'safety':
        return 'shield.fill';
      case 'system':
        return 'sparkles';
      default:
        return 'bell.fill';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'trip':
        return '#3B82F6';
      case 'message':
        return '#8B5CF6';
      case 'match':
        return '#10B981';
      case 'safety':
        return '#EF4444';
      case 'system':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Trigger haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (onNotificationPress) {
      onNotificationPress(notification);
    } else {
      Alert.alert(notification.title, notification.message);
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View className="flex-1">
        <Animated.View
          style={{ opacity: backdropOpacity }}
          className="absolute inset-0 bg-black/20"
        >
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={{ transform: [{ translateX: slideX }] }}
          className={isDark ? 'flex-1 bg-[#0B1220]' : 'flex-1 bg-gray-50'}
        >
          <View className={`px-6 py-4 border-b pt-14 ${isDark ? 'bg-[#0F172A] border-[#1E293B]' : 'bg-white border-gray-100'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>Notifications</Text>
                {unreadCount > 0 && (
                  <View className="bg-red-500 rounded-full px-2 py-1">
                    <Text className="text-white text-xs font-bold">{unreadCount}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={onClose} className={`rounded-full p-2 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]'}`}>
                <X size={20} color={isDark ? '#E2E8F0' : '#666'} strokeWidth={2.25} />
              </TouchableOpacity>
            </View>
          </View>

          {notifications.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <IconSymbol size={60} name="bell" color={isDark ? '#3A4A66' : '#DDD'} />
              <Text className={`mt-4 font-semibold ${isDark ? 'text-[#94A3B8]' : 'text-gray-500'}`}>No notifications yet</Text>
              <Text className={`text-sm mt-2 ${isDark ? 'text-[#64748B]' : 'text-gray-400'}`}>You&apos;re all caught up!</Text>
            </View>
          ) : (
            <ScrollView className="flex-1">
              {notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  onPress={() => handleNotificationPress(notification)}
                  className={`px-6 py-4 border-b ${isDark ? 'border-[#1E293B]' : 'border-gray-100'} ${
                    !notification.read ? (isDark ? 'bg-[#111B2E]' : 'bg-blue-50') : (isDark ? 'bg-[#0B1220]' : 'bg-white')
                  }`}
                >
                  <View className="flex-row items-start gap-3">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: getNotificationColor(notification.type) + '20',
                      }}
                    >
                      <IconSymbol
                        size={20}
                        name={getNotificationIcon(notification.type) as any}
                        color={getNotificationColor(notification.type)}
                      />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1">
                          <Text className={`font-semibold ${isDark ? 'text-white' : !notification.read ? 'text-black' : 'text-gray-900'}`}>
                            {notification.title}
                          </Text>
                          <Text className={`text-sm mt-1 ${isDark ? 'text-[#94A3B8]' : !notification.read ? 'text-gray-700' : 'text-gray-600'}`}>
                            {notification.message}
                          </Text>
                        </View>
                        {!notification.read && <View className="w-2 h-2 rounded-full bg-blue-800 mt-2" />}
                      </View>
                      <Text className={`text-xs mt-2 ${isDark ? 'text-[#64748B]' : 'text-gray-500'}`}>{notification.timestamp}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
