/**
 * Central Perk palette. `Colors.light` / `Colors.dark` keep the same shape the
 * stock template expects, so `useThemeColor`, `ThemedText` and `ThemedView`
 * keep working untouched — they just resolve to Friends colors now.
 */

import { Platform } from 'react-native';

export const Palette = {
  couch: '#F4A93C', // the orange couch
  teal: '#2E7D8F', // Central Perk signage
  cream: '#F5EDE0', // the walls
  burgundy: '#7B2D26', // deep chair upholstery
  frame: '#FFD84D', // the yellow picture frame on the peephole
  espresso: '#3B2A22',
};

export const Colors = {
  light: {
    text: '#2A1D16',
    background: Palette.cream,
    tint: Palette.teal,
    icon: '#7A6A5C',
    tabIconDefault: '#A2907F',
    tabIconSelected: Palette.teal,
    // app-specific
    surface: '#FFFBF4',
    border: '#E2D3BE',
    couch: Palette.couch,
    teal: Palette.teal,
    burgundy: Palette.burgundy,
    frame: Palette.frame,
    bubbleUser: Palette.teal,
    bubbleUserText: '#FFFFFF',
    bubbleAgent: '#FFFFFF',
    bubbleAgentText: '#2A1D16',
    muted: '#8A7868',
    danger: '#B3402F',
  },
  dark: {
    text: '#F3E9DA',
    background: '#1A1210',
    tint: Palette.couch,
    icon: '#B5A08C',
    tabIconDefault: '#7E6B5B',
    tabIconSelected: Palette.couch,
    // app-specific
    surface: '#251A16',
    border: '#3D2B24',
    couch: Palette.couch,
    teal: '#4FA3B5',
    burgundy: Palette.burgundy,
    frame: Palette.frame,
    bubbleUser: Palette.burgundy,
    bubbleUserText: '#FFF3E2',
    bubbleAgent: '#2E211B',
    bubbleAgentText: '#F3E9DA',
    muted: '#A7907C',
    danger: '#E4705C',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
});
