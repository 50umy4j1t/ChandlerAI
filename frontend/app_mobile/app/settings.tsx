import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeBaseUrl } from '@/lib/agent-client';
import { useChandler } from '@/providers/chandler-provider';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { apiUrl, setApiUrl, userId } = useChandler();

  const [draft, setDraft] = useState(apiUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(`${normalizeBaseUrl(draft)}/health`);
      setResult(res.ok ? 'Connected. Could this BE any more online?' : `Server said ${res.status}.`);
    } catch (e: any) {
      setResult(`PIVOT! ${e?.message ?? 'Could not reach it.'}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    await setApiUrl(normalizeBaseUrl(draft));
    setResult('Saved.');
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <ThemedText type="subtitle" style={{ color: c.text }}>
        Backend
      </ThemedText>
      <ThemedText style={[styles.hint, { color: c.muted }]}>
        Your dev machine&apos;s LAN address, e.g. http://192.168.1.42:7777
      </ThemedText>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.42:7777"
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
      />

      <View style={styles.row}>
        <Pressable
          onPress={save}
          style={({ pressed }) => [styles.btn, { backgroundColor: c.couch, opacity: pressed ? 0.75 : 1 }]}>
          <ThemedText style={styles.btnLabel}>Save</ThemedText>
        </Pressable>
        <Pressable
          onPress={test}
          disabled={testing}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: c.teal, opacity: pressed || testing ? 0.7 : 1 },
          ]}>
          {testing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={[styles.btnLabel, { color: '#fff' }]}>Test</ThemedText>
          )}
        </Pressable>
      </View>

      {result ? <ThemedText style={{ color: c.muted }}>{result}</ThemedText> : null}

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <ThemedText type="subtitle" style={{ color: c.text }}>
        Identity
      </ThemedText>
      <ThemedText style={[styles.hint, { color: c.muted }]}>
        Generated once on this install and sent as `user_id` with every run.
      </ThemedText>
      <ThemedText selectable style={[styles.mono, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}>
        {userId || '…'}
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 10 },
  hint: { fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { color: '#2A1D16', fontWeight: '700', fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  mono: {
    fontSize: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: 'monospace',
  },
});
