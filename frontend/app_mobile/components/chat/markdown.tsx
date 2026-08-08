/**
 * A small markdown renderer for chat bubbles.
 *
 * Deliberately hand-rolled: the agent only ever emits a narrow slice of markdown
 * (short paragraphs, plans as bullet/number lists, the odd bold or `code` span),
 * and the maintained RN markdown packages all drag in peer deps that fight with
 * React 19. Anything not handled here degrades to plain text, never to a crash.
 *
 * Supported: # headings, - / * / + bullets, 1. numbered lists, > quotes, ---
 * rules, ``` fenced code, and inline **bold**, *italic*, `code`, ~~strike~~,
 * [links](url) (rendered as text - the app has nowhere to navigate to).
 */

import { StyleSheet, Text, View, type TextStyle } from 'react-native';

type Props = {
  text: string;
  /** Body colour; headings and list markers derive from it. */
  color: string;
  /** Background for code spans/blocks. */
  codeBg: string;
  /** Muted colour for quote bars and list markers. */
  accent: string;
};

/* -------------------------------- inline -------------------------------- */

/** Split on the inline markers, keeping the delimiters so we can style them. */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]*\))/g;

function Inline({ text, color, codeBg }: { text: string; color: string; codeBg: string }) {
  const parts = text.split(INLINE).filter((p) => p !== '' && p !== undefined);

  return (
    <>
      {parts.map((part, i) => {
        const key = `${i}-${part.slice(0, 8)}`;

        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={key} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('__') && part.endsWith('__')) {
          return (
            <Text key={key} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('~~') && part.endsWith('~~')) {
          return (
            <Text key={key} style={styles.strike}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={key} style={[styles.code, { backgroundColor: codeBg }]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return (
            <Text key={key} style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        const link = /^\[([^\]]+)\]\([^)]*\)$/.exec(part);
        if (link) {
          return (
            <Text key={key} style={styles.link}>
              {link[1]}
            </Text>
          );
        }
        return <Text key={key}>{part}</Text>;
      })}
    </>
  );
}

/* --------------------------------- block -------------------------------- */

const HEADING_SIZE: Record<number, TextStyle> = {
  1: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  2: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  3: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
};

export function Markdown({ text, color, codeBg, accent }: Props) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const body = paragraph.join(' ');
    blocks.push(
      <Text key={`p${blocks.length}`} style={[styles.text, { color }]}>
        <Inline text={body} color={color} codeBg={codeBg} />
      </Text>,
    );
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fenced code — consume until the closing fence (or the end, so a
    // half-streamed block still renders instead of swallowing the rest).
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      blocks.push(
        <View key={`c${blocks.length}`} style={[styles.codeBlock, { backgroundColor: codeBg }]}>
          <Text style={[styles.codeBlockText, { color }]}>{body.join('\n')}</Text>
        </View>,
      );
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      flushParagraph();
      blocks.push(<View key={`r${blocks.length}`} style={[styles.rule, { backgroundColor: accent }]} />);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push(
        <Text key={`h${blocks.length}`} style={[HEADING_SIZE[heading[1].length], styles.heading, { color }]}>
          <Inline text={heading[2]} color={color} codeBg={codeBg} />
        </Text>,
      );
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push(
        <View key={`q${blocks.length}`} style={[styles.quote, { borderLeftColor: accent }]}>
          <Text style={[styles.text, { color }]}>
            <Inline text={quote[1]} color={color} codeBg={codeBg} />
          </Text>
        </View>,
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const marker = bullet ? '•' : `${ordered![1]}.`;
      const body = bullet ? bullet[1] : ordered![2];
      blocks.push(
        <View key={`l${blocks.length}`} style={styles.listRow}>
          <Text style={[styles.marker, { color: accent }]}>{marker}</Text>
          <Text style={[styles.text, styles.listBody, { color }]}>
            <Inline text={body} color={color} codeBg={codeBg} />
          </Text>
        </View>,
      );
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();

  return <View style={styles.wrap}>{blocks}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  text: { fontSize: 16, lineHeight: 22 },
  heading: { marginTop: 2 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  code: { fontFamily: 'monospace', fontSize: 14, borderRadius: 4 },
  codeBlock: { borderRadius: 10, padding: 10 },
  codeBlockText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { fontSize: 16, lineHeight: 22, minWidth: 16 },
  listBody: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  rule: { height: StyleSheet.hairlineWidth, opacity: 0.5, marginVertical: 4 },
});
