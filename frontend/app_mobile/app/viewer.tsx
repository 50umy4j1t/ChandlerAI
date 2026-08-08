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

/** Synthetic origin for generated apps — see the baseUrl note on the WebView below. */
const APP_ORIGIN = 'https://app.chandler.local/';

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
          // A real https origin (rather than '') gives the page a secure, non-opaque
          // origin: localStorage works, motion sensors are allowed, and CDN <script>
          // tags (three.js) resolve. Nothing is actually served from this host.
          source={{ html, baseUrl: APP_ORIGIN }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          // Generated HTML is untrusted, so lock the WebView down.
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          // Alarms/games need to make sound the moment they fire, not on a second tap.
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          // Block every top-level navigation away from the generated page. Subresource
          // loads (<script src>, <img>) do not pass through here, so CDN libs still load.
          onShouldStartLoadWithRequest={(req) =>
            req.url === 'about:blank' ||
            req.url.startsWith('data:') ||
            req.url.startsWith(APP_ORIGIN)
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
