import { EmptyState, enterFromBelow } from '@/components/ui/motion';
import * as Haptics from 'expo-haptics';
import { Bell, BellOff, CheckCheck, MessageCircle, Plane, ShieldAlert, Sparkles, UserPlus, X, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  onMarkAllRead?: () => void;
}

type Filter = 'all' | 'unread';

const { width: screenWidth } = Dimensions.get('window');

const KIND_STYLES: Record<Notification['type'], { icon: LucideIcon; color: string; label: string }> = {
  trip: { icon: Plane, color: '#3B82F6', label: 'Trip' },
  message: { icon: MessageCircle, color: '#8B5CF6', label: 'Message' },
  match: { icon: UserPlus, color: '#10B981', label: 'Friends' },
  safety: { icon: ShieldAlert, color: '#EF4444', label: 'Safety' },
  system: { icon: Sparkles, color: '#F59E0B', label: 'PartyUp' },
};

export default function NotificationModal({
  visible,
  onClose,
  isDark = false,
  notifications = [],
  onNotificationPress,
  onMarkAllRead,
}: NotificationModalProps) {
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(-screenWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [filter, setFilter] = useState<Filter>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;
  const shown = useMemo(() => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications), [filter, notifications]);
  const fresh = shown.filter((n) => !n.read);
  const earlier = shown.filter((n) => n.read);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(slideX, { toValue: -screenWidth, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [backdropOpacity, slideX, visible]);

  const handleNotificationPress = async (notification: Notification) => {
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

  const t = {
    screen: isDark ? '#0B1220' : '#EEF2F8',
    card: isDark ? '#16223A' : '#FFFFFF',
    cardUnread: isDark ? '#1B2A47' : '#FFFFFF',
    border: isDark ? '#26364F' : '#E1E7F0',
    title: isDark ? '#FFFFFF' : '#182A4D',
    body: isDark ? '#94A3B8' : '#6C7A95',
    faint: isDark ? '#64748B' : '#9AA6BC',
    chip: isDark ? '#18253C' : '#ECF0F7',
  };

  const renderCard = (notification: Notification, index: number) => {
    const kind = KIND_STYLES[notification.type] ?? { icon: Bell, color: '#6B7280', label: 'Update' };
    const Icon = kind.icon;
    const unread = !notification.read;
    return (
      <Reanimated.View key={notification.id} entering={enterFromBelow(index)}>
        <TouchableOpacity activeOpacity={0.75} onPress={() => handleNotificationPress(notification)} style={{ marginBottom: 12 }}>
          <View
            style={{
              backgroundColor: unread ? t.cardUnread : t.card,
              borderColor: unread ? `${kind.color}55` : t.border,
              borderWidth: 1,
              borderRadius: 20,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
              shadowColor: '#0B1220',
              shadowOpacity: isDark ? 0 : 0.07,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: isDark ? 0 : 2,
            }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${kind.color}1F`, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={21} color={kind.color} strokeWidth={2.2} />
            </View>

            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <Text style={{ color: kind.color }} className="text-[11px] font-bold uppercase tracking-wider">
                  {kind.label}
                </Text>
                <Text style={{ color: t.faint }} className="text-[11px]">
                  {'  ·  '}
                  {notification.timestamp}
                </Text>
              </View>
              <Text numberOfLines={1} style={{ color: t.title }} className={`mt-1 text-[15px] ${unread ? 'font-bold' : 'font-semibold'}`}>
                {notification.title}
              </Text>
              <Text numberOfLines={3} style={{ color: t.body }} className="mt-0.5 text-[13px] leading-[18px]">
                {notification.message}
              </Text>
            </View>

            {unread ? <View key="dot" style={{ backgroundColor: kind.color }} className="ml-2 mt-1.5 h-2.5 w-2.5 rounded-full" /> : null}
          </View>
        </TouchableOpacity>
      </Reanimated.View>
    );
  };

  const sectionLabel = (label: string) => (
    <Text style={{ color: t.faint }} className="mb-2.5 mt-1 px-1 text-xs font-bold uppercase tracking-widest">
      {label}
    </Text>
  );

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View className="flex-1">
        <Animated.View style={{ opacity: backdropOpacity }} className="absolute inset-0 bg-black/30">
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        <Animated.View style={{ flex: 1, backgroundColor: t.screen, transform: [{ translateX: slideX }] }}>
          <View style={{ paddingTop: insets.top + 12 }} className="px-5 pb-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text style={{ color: t.title }} className="text-[28px] font-black tracking-tight">
                  Notifications
                </Text>
                <Text style={{ color: t.body }} className="mt-0.5 text-[13px]">
                  {unreadCount > 0 ? `${unreadCount} new ${unreadCount === 1 ? 'update' : 'updates'}` : "You're all caught up"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                accessibilityLabel="Close notifications"
                style={{ backgroundColor: t.chip }}
                className="h-10 w-10 items-center justify-center rounded-full">
                <X size={20} color={isDark ? '#E2E8F0' : '#475569'} strokeWidth={2.25} />
              </TouchableOpacity>
            </View>

            <View className="mt-4 flex-row items-center justify-between">
              <View style={{ backgroundColor: t.chip }} className="flex-row rounded-full p-1">
                {(['all', 'unread'] as const).map((value) => {
                  const active = filter === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setFilter(value)}
                      style={{ backgroundColor: active ? (isDark ? '#2B3B57' : '#FFFFFF') : 'transparent' }}
                      className="flex-row items-center rounded-full px-4 py-1.5">
                      <Text style={{ color: active ? t.title : t.body }} className="text-[13px] font-semibold">
                        {value === 'all' ? 'All' : 'Unread'}
                      </Text>
                      {value === 'unread' && unreadCount > 0 ? (
                        <View key="count" className="ml-1.5 min-w-[18px] items-center rounded-full bg-[#EF4444] px-1.5">
                          <Text className="text-[11px] font-bold text-white">{unreadCount}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {onMarkAllRead && unreadCount > 0 ? (
                <TouchableOpacity key="mark-all" onPress={onMarkAllRead} className="flex-row items-center gap-1.5 px-1 py-1.5">
                  <CheckCheck size={16} color="#3B82F6" strokeWidth={2.4} />
                  <Text className="text-[13px] font-semibold text-[#3B82F6]">Mark all read</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {shown.length === 0 ? (
            <View key="empty" className="flex-1">
              <EmptyState
                icon={filter === 'unread' ? <BellOff size={34} color={isDark ? '#64748B' : '#9AA6BC'} /> : <Bell size={34} color={isDark ? '#64748B' : '#9AA6BC'} />}
                title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                message={filter === 'unread' ? 'Nice — you have seen everything.' : "Trip updates, messages and friend requests will show up here."}
              />
            </View>
          ) : (
            <ScrollView key="list" className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
              {fresh.length > 0 ? (
                <View key="new">
                  {sectionLabel('New')}
                  {fresh.map((n, i) => renderCard(n, i))}
                </View>
              ) : null}
              {earlier.length > 0 ? (
                <View key="earlier" className={fresh.length > 0 ? 'mt-3' : ''}>
                  {sectionLabel('Earlier')}
                  {earlier.map((n, i) => renderCard(n, fresh.length + i))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
