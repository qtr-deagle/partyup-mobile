import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface Notification {
  id: number;
  type: 'trip' | 'message' | 'match' | 'safety';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionId?: string;
}

interface NotificationModalProps {
  notifications?: Notification[];
  onNotificationPress?: (notification: Notification) => void;
}

export default function NotificationModal({ 
  notifications = [],
  onNotificationPress
}: NotificationModalProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
  }, [notifications]);

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

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-4 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-bold text-black">Notifications</Text>
            {unreadCount > 0 && (
              <View className="bg-red-500 rounded-full px-2 py-1">
                <Text className="text-white text-xs font-bold">{unreadCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity className="p-2">
            <IconSymbol size={20} name="ellipsis" color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <IconSymbol size={60} name="bell" color="#DDD" />
          <Text className="text-gray-500 mt-4 font-semibold">No notifications yet</Text>
          <Text className="text-sm text-gray-400 mt-2">You're all caught up!</Text>
        </View>
      ) : (
        <ScrollView className="flex-1">
          {notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              onPress={() => handleNotificationPress(notification)}
              className={`px-4 py-4 border-b border-gray-100 ${
                !notification.read ? 'bg-blue-50' : 'bg-white'
              }`}
            >
              <View className="flex-row items-start gap-3">
                {/* Icon */}
                <View className="w-10 h-10 rounded-full items-center justify-center" 
                  style={{ 
                    backgroundColor: getNotificationColor(notification.type) + '20'
                  }}
                >
                  <IconSymbol 
                    size={20} 
                    name={getNotificationIcon(notification.type) as any}
                    color={getNotificationColor(notification.type)}
                  />
                </View>

                {/* Content */}
                <View className="flex-1">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className={`font-semibold ${!notification.read ? 'text-black' : 'text-gray-900'}`}>
                        {notification.title}
                      </Text>
                      <Text className={`text-sm mt-1 ${!notification.read ? 'text-gray-700' : 'text-gray-600'}`}>
                        {notification.message}
                      </Text>
                    </View>
                    {!notification.read && (
                      <View className="w-2 h-2 rounded-full bg-blue-800 mt-2" />
                    )}
                  </View>
                  <Text className="text-xs text-gray-500 mt-2">{notification.timestamp}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
