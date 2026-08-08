import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RunStatus } from '@/lib/types';

type Props = {
  status: RunStatus;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ status, onSend, onStop }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const [text, setText] = useState('');
  const busy = status !== 'idle';

  const submit = () => {
    const body = text.trim();
    if (!body || busy) return;
    setText('');
    onSend(body);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
        placeholder="Ask for an app…"
        placeholderTextColor={c.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        editable={!busy}
        multiline
        maxLength={2000}
        returnKeyType="send"
        blurOnSubmit={false}
      />
      <Pressable
        onPress={busy ? onStop : submit}
        disabled={!busy && !text.trim()}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: busy ? c.danger : c.couch,
            opacity: pressed ? 0.75 : !busy && !text.trim() ? 0.4 : 1,
          },
        ]}>
        <IconSymbol name={busy ? 'xmark' : 'paperplane.fill'} size={20} color="#2A1D16" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
