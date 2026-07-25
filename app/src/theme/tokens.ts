/**
 * myB design tokens — exported from the myB Design System artifact.
 * Semantic tokens: every color has a dark and light pairing. Dark is the
 * default app theme (mockups); light is fully supported via ThemeContext.
 */

import type { TextStyle } from 'react-native';

export interface ColorTokens {
  primary: string;
  primaryHover: string;
  accent: string;
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  star: string;
  accentSoft: string;
  successSoft: string;
  warningSoft: string;
  errorSoft: string;
}

export const darkColors: ColorTokens = {
  primary: '#1D6FD8',
  primaryHover: '#3B82F0',
  accent: '#3B9EFF',
  bg: '#0B0E16',
  surface: '#141A26',
  surfaceRaised: '#1C2433',
  border: '#26303F',
  text: '#EEF2F8',
  textMuted: '#9AA6B8',
  success: '#22C55E',
  warning: '#F5A623',
  error: '#F87171',
  info: '#3B9EFF',
  star: '#FFC043',
  accentSoft: 'rgba(59,158,255,0.14)',
  successSoft: 'rgba(34,197,94,0.16)',
  warningSoft: 'rgba(245,166,35,0.16)',
  errorSoft: 'rgba(248,113,113,0.16)',
};

export const lightColors: ColorTokens = {
  primary: '#1D6FD8',
  primaryHover: '#1A66CC',
  accent: '#2C7BE5',
  bg: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E4E9F0',
  text: '#0E1726',
  textMuted: '#5A6B83',
  success: '#16A34A',
  warning: '#F5A623',
  error: '#DC2626',
  info: '#2C7BE5',
  star: '#FFB020',
  accentSoft: 'rgba(44,123,229,0.10)',
  successSoft: 'rgba(22,163,74,0.12)',
  warningSoft: 'rgba(245,166,35,0.16)',
  errorSoft: 'rgba(220,38,38,0.10)',
};

/** Base-4 spacing scale. Card padding: 16 (mobile); list rhythm: 16. */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
} as const;

/** Five radius steps, buttons → full pills. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/**
 * Type scale — Plus Jakarta Sans everywhere (fallback: system).
 * Letter-spacing converted from em to RN's absolute units per size.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type: Record<string, TextStyle> = {
  display: { fontFamily: fonts.extraBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  h2: { fontFamily: fonts.semiBold, fontSize: 24, lineHeight: 32, letterSpacing: -0.24 },
  h3: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 16 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.12 },
  overline: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
};

/**
 * Elevation: dark mode builds depth with borders (+ glow at e3); light mode
 * with soft ambient shadows. Spread as style props onto Views.
 */
export function elevation(level: 1 | 2 | 3, colors: ColorTokens, isDark: boolean) {
  if (isDark) {
    return {
      borderWidth: 1,
      borderColor: colors.border,
      ...(level >= 2 && {
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: level === 2 ? 14 : 20,
        shadowOffset: { width: 0, height: level === 2 ? 10 : 16 },
        elevation: level === 2 ? 6 : 10,
      }),
    } as const;
  }
  return {
    shadowColor: '#101828',
    shadowOpacity: level === 1 ? 0.08 : level === 2 ? 0.1 : 0.16,
    shadowRadius: level === 1 ? 3 : level === 2 ? 12 : 32,
    shadowOffset: { width: 0, height: level === 1 ? 1 : level === 2 ? 4 : 12 },
    elevation: level === 1 ? 2 : level === 2 ? 5 : 10,
  } as const;
}
