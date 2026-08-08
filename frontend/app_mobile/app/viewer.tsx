import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { readHtml } from '@/lib/storage';
import { useChandler } from '@/providers/chandler-provider';

export default function ViewerScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apps } = useChandler();

  const html = useMemo(() => (id ? readHtml(id) : null), [id]);
  const name = apps.find((a) => a.id === id)?.name ?? 'Your app';

  return (
    <View style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.bar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <ThemedText numberOfLines={1} style={[styles.title, { color: c.text }]}>
          {name}
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <IconSymbol name="xmark" size={22} color={c.teal} />
        </Pressable>
      </View>

      {html ? (
        <WebView
          source={{ html, baseUrl: '' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          // Generated HTML is untrusted, so lock the WebView down.
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction
          // Block every outbound navigation; the agent inlines everything anyway.
          onShouldStartLoadWithRequest={(req) =>
            req.url === 'about:blank' || req.url.startsWith('data:')
          }
          style={{ backgroundColor: c.background }}
        />
      ) : (
        <View style={styles.empty}>
          <ThemedText style={{ color: c.muted, textAlign: 'center' }}>
            Could this BE any more missing? The file for this app is gone.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  close: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
