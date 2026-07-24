import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Briefcase, Compass, Home, Map, MessageCircle, UserRound } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';

  const activeTintColor = isDark ? '#E2E8F0' : '#334155';
  const inactiveTintColor = isDark ? '#64748B' : '#94A3B8';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: inactiveTintColor,
        headerShown: false,
        sceneStyle: {
          paddingTop: insets.top,
        },
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 10,
          paddingHorizontal: 12,
        },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          lineHeight: 14,
          marginTop: 4,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={25} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => <Compass size={25} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="carpooling"
        options={{
          title: 'Travel',
          tabBarIcon: ({ color }) => <Briefcase size={25} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <Map size={25} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <MessageCircle size={25} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <UserRound size={25} color={color} strokeWidth={1.9} />,
        }}
      />
    </Tabs>
  );
}
