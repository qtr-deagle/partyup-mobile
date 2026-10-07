import { TabButton } from '@/components/tab-button';
import { TAB_BAR_RADIUS, TabBarBackground, tabBarColors } from '@/components/ui/tab-bar-background';
import { TabIcon } from '@/components/ui/tab-icon';
import { ScrollAwareTabBar, TAB_BAR_HEIGHT, TabBarVisibilityProvider, useTabBarBottomGap } from '@/components/ui/tab-bar-visibility';
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
  const tabBarBottomGap = useTabBarBottomGap();

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

  const { active: activeTintColor, inactive: inactiveTintColor, activePill: pillColor } = tabBarColors(isDark);
  const sceneBackgroundColor = isDark ? '#0B1220' : '#F8FAFC';

  return (
    <TabBarVisibilityProvider>
      <Tabs
        // Also called as a plain function by the library, so render an element.
        tabBar={(props) => <ScrollAwareTabBar {...props} />}
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
          // Rendered as an element: the library calls tabBarButton as a plain
          // function, which merges its compiler memo cache into the tab item's.
          tabBarButton: (props) => <TabButton {...props} />,
          // Floating pill bar over the page (see ScrollAwareTabBar), inset from the
          // screen edges and lifted above the home indicator. Screens pad their
          // bottoms with useTabBarSpace() so content can clear it.
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => <TabBarBackground isDark={isDark} />,
          tabBarStyle: {
            borderTopWidth: 0,
            borderRadius: TAB_BAR_RADIUS,
            marginHorizontal: 14,
            marginBottom: tabBarBottomGap,
            height: TAB_BAR_HEIGHT,
            paddingTop: 6,
            paddingBottom: 6,
            paddingHorizontal: 4,
            // iOS gets a soft lift; Android elevation is off since the pill is
            // drawn in SVG and elevation would cast a square shadow.
            elevation: 0,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.5 : 0.22,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          },
          tabBarItemStyle: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 0,
            paddingBottom: 0,
          },
          tabBarLabel: ({ focused, children }) => (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10.5,
                fontWeight: focused ? '700' : '500',
                lineHeight: 13,
                marginTop: 3,
                color: focused ? activeTintColor : inactiveTintColor,
              }}
            >
              {children}
            </Text>
          ),
          tabBarIconStyle: {
            marginBottom: 0,
          },
        }}
      >
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
            tabBarBadgeStyle: {
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: '700',
            },
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
    </TabBarVisibilityProvider>
  );
}
