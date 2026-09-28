import { HapticTab } from '@/components/haptic-tab';
import { TabIcon } from '@/components/ui/tab-icon';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLocationHeartbeat } from '@/hooks/use-location-heartbeat';
import { useUnreadChats } from '@/hooks/use-unread-chats';
import { Redirect, Tabs } from 'expo-router';
import { Briefcase, Compass, Home, Map, MessageCircle, UserRound } from 'lucide-react-native';
import React from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { session, loading, profile, profileReady } = useAuth();
  useLocationHeartbeat();
  const unreadChats = useUnreadChats();

  // Hold rendering until the profile is known so unverified travelers don't
  // see the tabs flash before the root VerificationGate redirects them.
  if (loading || !profileReady) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (profile?.role === 'traveler' && profile.verification_status !== 'approved') {
    return <Redirect href="/verification-required" />;
  }

  const activeTintColor = isDark ? '#93C5FD' : '#1E40AF';
  const inactiveTintColor = isDark ? '#64748B' : '#94A3B8';
  const tabBarBackgroundColor = isDark ? '#0F172A' : '#FFFFFF';
  const sceneBackgroundColor = isDark ? '#0B1220' : '#F8FAFC';
  const borderColor = isDark ? '#1E293B' : '#E2E8F0';
  const pillColor = isDark ? 'rgba(59,130,246,0.22)' : 'rgba(30,64,175,0.10)';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: inactiveTintColor,
        headerShown: false,
        header: () => null,
        animation: 'shift',
        sceneStyle: {
          paddingTop: insets.top,
          backgroundColor: sceneBackgroundColor,
        },
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: tabBarBackgroundColor,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          elevation: 0,
          shadowOpacity: 0,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 2,
          paddingHorizontal: 12,
        },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 12,
        },
        tabBarLabel: ({ focused, children }) => (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 10,
              fontWeight: focused ? '700' : '500',
              lineHeight: 13,
              marginTop: 3,
              color: focused ? activeTintColor : inactiveTintColor,
            }}>
            {children}
          </Text>
        ),
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Home} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Compass} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
      <Tabs.Screen
        name="carpooling"
        options={{
          title: 'Travel',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Briefcase} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          // Google Maps on Android renders black inside an animated (fading/shifting) scene.
          animation: 'none',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Map} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarBadge: unreadChats > 0 ? (unreadChats > 99 ? '99+' : unreadChats) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageCircle} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={UserRound} color={color} focused={focused} pillColor={pillColor} />,
        }}
      />
    </Tabs>
  );
}
