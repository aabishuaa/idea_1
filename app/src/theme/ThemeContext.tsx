import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { type ColorTokens, darkColors, lightColors } from './tokens';

type ThemePreference = 'system' | 'dark' | 'light';

interface ThemeContextValue {
  colors: ColorTokens;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'myb.theme-preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // myB is a dark-first product (every mockup is dark), so dark is the
  // default rather than following the device. Settings offers light and
  // "follow system" for anyone who wants them.
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Non-fatal: preference simply won't persist across restarts.
    });
  }, []);

  const isDark =
    preference === 'system' ? systemScheme !== 'light' : preference === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      preference,
      setPreference,
    }),
    [isDark, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
