import { Ionicons } from '@expo/vector-icons';
import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs, router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/Text';
import { ScalePress, lightTap } from '@/components/ui/animated';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  search: 'search',
  bookings: 'calendar',
  profile: 'person',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  search: 'Search',
  bookings: 'Bookings',
  profile: 'Profile',
};

/** Mobile tab bar from the design system: 4 tabs + raised center action. */
function MybTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const renderTab = (routeName: string, index: number) => {
    const focused = state.index === index;
    return (
      <Pressable
        key={routeName}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={TAB_LABELS[routeName]}
        onPress={() => {
          if (!focused) lightTap();
          navigation.navigate(routeName);
        }}
        style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.s2 }}
      >
        <Ionicons
          name={
            focused
              ? TAB_ICONS[routeName] ?? 'ellipse'
              : (`${TAB_ICONS[routeName]}-outline` as keyof typeof Ionicons.glyphMap)
          }
          size={22}
          color={focused ? colors.accent : colors.textMuted}
        />
        <AppText variant="caption" style={{ color: focused ? colors.accent : colors.textMuted }}>
          {TAB_LABELS[routeName]}
        </AppText>
      </Pressable>
    );
  };

  const routes = state.routes.map((route) => route.name);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, space.s2),
        paddingHorizontal: space.s2,
      }}
    >
      {routes.slice(0, 2).map((name) => renderTab(name, routes.indexOf(name)))}

      <View style={{ marginTop: -space.s5, marginHorizontal: space.s2 }}>
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Request a job"
          haptic
          to={0.9}
          onPress={() => router.push('/job/new')}
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.full,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            ...(isDark
              ? { borderWidth: 1, borderColor: colors.border }
              : {
                  shadowColor: '#101828',
                  shadowOpacity: 0.16,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                }),
          }}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </ScalePress>
      </View>

      {routes.slice(2).map((name) => renderTab(name, routes.indexOf(name)))}
    </View>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  usePushRegistration();

  if (!loading && !session) return <Redirect href="/(auth)/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <MybTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
