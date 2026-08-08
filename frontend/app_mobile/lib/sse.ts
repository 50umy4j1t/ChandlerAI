/**
 * Minimal SSE frame parser.
 *
 * agno emits exactly `event: <Name>\ndata: <json>\n\n` (agno/os/utils.py:234),
 * but a single reader.read() can split anywhere — mid-line, mid-JSON, even
 * mid-UTF8-sequence. So we buffer and only emit complete blank-line-terminated
 * frames, keeping the remainder for the next chunk.
 */

export type SseFrame = { event: string; data: string };

const FRAME_END = /\r?\n\r?\n/;

export function createSseParser() {
  let buf = '';

  return function push(chunk: string): SseFrame[] {
    buf += chunk;
    const frames: SseFrame[] = [];

    for (;;) {
      const m = FRAME_END.exec(buf);
      if (!m) break;

      const raw = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);

      let event = 'message';
      const dataLines: string[] = [];

      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue; // blank or keep-alive comment
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          // Per spec a single leading space after the colon is stripped.
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }

      if (dataLines.length) frames.push({ event, data: dataLines.join('\n') });
    }

    return frames;
  };
}
