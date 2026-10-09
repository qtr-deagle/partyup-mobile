import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getActiveChatThread } from '@/lib/active-chat';
import { markNotificationRead } from '@/lib/notifications';
import { getNotifications } from '@/lib/push';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { Image } from 'expo-image';
import type { NotificationResponse } from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { Bell, BadgeCheck, Car, MessageCircle, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastKind = 'message' | 'trip' | 'match' | 'system';

type Toast = {
  key: string;
  kind: ToastKind;
  title: string;
  body: string;
  avatarUrl?: string | null;
  notificationId?: string;
  data: Record<string, unknown>;
};

const VISIBLE_MS = 4200;

// Guards against routing the same tap twice (launch check + listener).
let lastHandledResponseId: string | null = null;
const HIDDEN_Y = -160;

const ICONS = { message: MessageCircle, trip: Car, match: UserPlus, system: BadgeCheck } as const;
const ACCENTS = { message: '#3B82F6', trip: '#10B981', match: '#8B5CF6', system: '#F0A93B' } as const;
const LABELS = { message: 'Message', trip: 'Trip', match: 'Friends', system: 'PartyUp' } as const;
const SETTLE = { duration: 320, easing: Easing.out(Easing.cubic) };

// Where tapping a toast or a push notification takes you.
export function routeForNotification(data: Record<string, unknown>): Href | null {
  const type = data.type as string | undefined;
  if (type === 'message' && typeof data.thread_id === 'string') {
    return { pathname: '/(tabs)/chat', params: { threadId: data.thread_id } };
  }
  if (type === 'trip') {
    return typeof data.trip_id === 'string' ? { pathname: '/trip/[id]', params: { id: data.trip_id } } : '/(tabs)/carpooling';
  }
  if (type === 'match') {
    if (data.kind === 'friend_accepted' && typeof data.from_user_id === 'string') {
      return { pathname: '/profile/[id]', params: { id: data.from_user_id } };
    }
    return '/friends';
  }
  if (type === 'system') {
    if (data.route === '/guild' || data.route === '/rewards') {
      return data.route;
    }
    return '/(tabs)/profile';
  }
  return null;
}

// Global, app-wide: turns new notifications and chat messages into an
// animated toast with a sound, and routes taps on push notifications (other
// than SOS, which SosAlertOverlay owns) to the matching screen.
export default function InAppNotifier() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const [queue, setQueue] = useState<Toast[]>([]);
  const current = queue[0] ?? null;
  const translateY = useSharedValue(HIDDEN_Y);

  const enqueue = useCallback((toast: Toast) => {
    setQueue((existing) => (existing.some((item) => item.key === toast.key) ? existing : [...existing, toast]));
  }, []);

  const shiftQueue = useCallback(() => setQueue((existing) => existing.slice(1)), []);

  // The auto-hide timer is cleared by the display effect's cleanup once the
  // queue advances; if it fires mid-swipe the repeat animation is harmless.
  const dismiss = useCallback(() => {
    translateY.set(
      withTiming(HIDDEN_Y, { duration: 220 }, (finished) => {
        if (finished) {
          runOnJS(shiftQueue)();
        }
      }),
    );
  }, [shiftQueue, translateY]);

  // Realtime sources. RLS limits chat_messages to threads the user is in.
  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(uniqueChannelName(`in-app-notifier:${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as { id: string; type: string; title: string; message: string; data: Record<string, unknown> | null };
        if (row.type === 'safety') {
          return; // SosAlertOverlay takes over the whole screen for these.
        }
        enqueue({
          key: `n:${row.id}`,
          kind: (row.type in ICONS ? row.type : 'system') as ToastKind,
          title: row.title,
          body: row.message,
          notificationId: row.id,
          data: { ...(row.data ?? {}), type: row.type },
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = payload.new as { id: string; thread_id: string; sender_id: string; message_type: string; body: string };
        if (row.sender_id === userId || row.message_type === 'system' || row.thread_id === getActiveChatThread()) {
          return;
        }
        void (async () => {
          const [{ data: sender }, { data: me }] = await Promise.all([
            supabase.from('profiles').select('display_name, avatar_url').eq('id', row.sender_id).maybeSingle(),
            supabase.from('chat_participants').select('muted, muted_until').eq('thread_id', row.thread_id).eq('user_id', userId).maybeSingle(),
          ]);
          if (me?.muted && (!me.muted_until || new Date(me.muted_until).getTime() > Date.now())) return;
          enqueue({
            key: `m:${row.id}`,
            kind: 'message',
            title: sender?.display_name ?? 'New message',
            body: row.message_type === 'location' ? '📍 Shared a location' : row.message_type === 'image' ? '📷 Sent a photo' : row.body,
            avatarUrl: sender?.avatar_url,
            data: { type: 'message', thread_id: row.thread_id },
          });
        })();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enqueue]);

  // Tapping a push while the app was backgrounded or closed.
  useEffect(() => {
    const Notifications = getNotifications();
    if (!userId || !Notifications) {
      return;
    }
    const handleResponse = (response: NotificationResponse | null) => {
      const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
      const responseId = response?.notification.request.identifier ?? null;
      if (!data || data.type === 'sos' || !responseId || responseId === lastHandledResponseId) {
        return;
      }
      lastHandledResponseId = responseId;
      // Otherwise the next cold start would route to it again.
      Notifications.clearLastNotificationResponse();
      if (typeof data.notification_id === 'string') {
        void markNotificationRead(data.notification_id);
      }
      const href = routeForNotification(data);
      if (href) {
        router.push(href);
      }
    };
    // Cold start: the app was opened by tapping the push.
    handleResponse(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [userId, router]);

  // Show the head of the queue: slide in, chime, auto-dismiss.
  useEffect(() => {
    if (!current) {
      return;
    }
    translateY.set(HIDDEN_Y);
    translateY.set(withTiming(0, SETTLE));
    if (current.kind === 'message') {
      feedback.received();
    } else {
      feedback.notify();
    }
    const hideTimer = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, [current, dismiss, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Follow the finger upward; resist downward drags.
      translateY.set(event.translationY < 0 ? event.translationY : event.translationY * 0.2);
    })
    .onEnd((event) => {
      if (event.translationY < -30 || event.velocityY < -500) {
        runOnJS(dismiss)();
      } else {
        translateY.set(withTiming(0, SETTLE));
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
    opacity: 1 + translateY.get() / Math.abs(HIDDEN_Y),
  }));

  if (!current) {
    return null;
  }

  const Icon = ICONS[current.kind] ?? Bell;
  const accent = ACCENTS[current.kind] ?? '#3B82F6';

  function open() {
    if (!current) {
      return;
    }
    if (current.notificationId) {
      void markNotificationRead(current.notificationId);
    }
    const href = routeForNotification(current.data);
    dismiss();
    if (href) {
      router.push(href);
    }
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        key={current.key}
        pointerEvents="box-none"
        style={[{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1000 }, animatedStyle]}>
        <Pressable
          onPress={open}
          className={`flex-row items-center overflow-hidden rounded-3xl border py-3 pl-4 pr-3.5 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white'}`}
          style={{ shadowColor: '#0B1220', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
          <View className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: accent }} />
          {current.avatarUrl ? (
            <View key="avatar">
              <Image source={{ uri: current.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              <View
                className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${isDark ? 'border-[#111B2E]' : 'border-white'}`}
                style={{ backgroundColor: accent }}>
                <Icon size={10} color="#FFFFFF" strokeWidth={2.6} />
              </View>
            </View>
          ) : (
            <View key="icon" className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}22` }}>
              <Icon size={21} color={accent} strokeWidth={2.2} />
            </View>
          )}
          <View className="ml-3 flex-1">
            <View className="flex-row items-center">
              <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                {LABELS[current.kind] ?? 'Update'}
              </Text>
              <Text className={`text-[11px] ${isDark ? 'text-[#64748B]' : 'text-[#9AA6BC]'}`}>{'  ·  now'}</Text>
            </View>
            <Text numberOfLines={1} className={`mt-0.5 text-[15px] font-bold ${isDark ? 'text-white' : 'text-[#182A4D]'}`}>
              {current.title}
            </Text>
            <Text numberOfLines={2} className={`mt-0.5 text-[13px] leading-[18px] ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>
              {current.body}
            </Text>
          </View>
        </Pressable>
        <View className={`mt-1.5 h-1 w-10 self-center rounded-full ${isDark ? 'bg-white/20' : 'bg-black/10'}`} />
      </Animated.View>
    </GestureDetector>
  );
}
