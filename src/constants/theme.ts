import { useColorScheme } from 'react-native';

/**
 * Veythralis palette. Near-black ink surfaces with an electric indigo accent and a
 * mint "protected" state, so the shield reads at a glance without shouting. The dark
 * theme is the primary one — a privacy tool should not glow.
 */
const palette = {
  light: {
    primary: '#4C2FD9',
    primarySoft: '#ECE8FF',
    onPrimary: '#FFFFFF',
    background: '#F5F5FA',
    card: '#FFFFFF',
    text: '#0E0E16',
    muted: '#63637A',
    border: '#E2E2EE',
    danger: '#D92D2D',
    success: '#0B9E6B',
    successSoft: '#E1F7EE',
    warn: '#B45309',
    chrome: '#FFFFFF',
    chromeBorder: '#E2E2EE',
    overlay: 'rgba(14,14,22,0.45)',
  },
  dark: {
    primary: '#8B7BFF',
    primarySoft: '#1E1A38',
    onPrimary: '#0A0A12',
    background: '#08080E',
    card: '#12121C',
    text: '#F4F4F8',
    muted: '#9494AC',
    border: '#232333',
    danger: '#FF6B6B',
    success: '#34D399',
    successSoft: '#0E2A20',
    warn: '#FBBF24',
    chrome: '#12121C',
    chromeBorder: '#232333',
    overlay: 'rgba(0,0,0,0.65)',
  },
};

export type Colors = typeof palette.light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

/** Brand constants, so the name lives in exactly one place. */
export const BRAND = {
  name: 'Veythralis',
  tagline: 'Browse without being profiled.',
  version: '2.0.0',
};
