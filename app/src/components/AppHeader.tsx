import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useDrawer } from '@/providers/DrawerProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';


function IconButton({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={() => {
        lightTap();
        onPress();
      }}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={24} color={colors.text} />
      {badge != null && badge > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -7,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: colors.primary,
            borderWidth: 1.5,
            borderColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12 }}>
            {badge > 9 ? '9+' : badge}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

interface AppHeaderProps {
  /** Unread notification count for the bell. */
  alerts?: number;
}

/**
 * The app bar from the mockups: ☰ menu · myB. wordmark · notifications · search.
 * The menu opens the sidebar (AppDrawer) rather than a route, so it works the
 * same from every screen that shows this header.
 */
export function AppHeader({ alerts = 0 }: AppHeaderProps) {
  const { openDrawer } = useDrawer();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: space.s2,
      }}
    >
      <IconButton icon="menu" label="Open menu" onPress={openDrawer} />

      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AppText variant="h2" style={{ letterSpacing: -0.5 }}>
          myB
        </AppText>
        <AppText variant="h2" color="accent">
          .
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s5 }}>
        <IconButton
          icon="notifications-outline"
          label="Notifications"
          badge={alerts}
          onPress={() => router.push('/notifications')}
        />
        <IconButton icon="search" label="Search" onPress={() => router.push('/search')} />
      </View>
    </View>
  );
}
