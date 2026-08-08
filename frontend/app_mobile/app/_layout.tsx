import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChandlerProvider } from '@/providers/chandler-provider';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const c = Colors[colorScheme];

  const navTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.border,
      primary: c.tint,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <ChandlerProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="viewer"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', title: 'Settings' }}
          />
        </Stack>
      </ChandlerProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
