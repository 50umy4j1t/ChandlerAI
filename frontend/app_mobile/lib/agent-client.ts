// MANDATORY: React Native's global fetch does not expose `response.body`, so
// streaming is impossible with it. expo/fetch is WinterCG-compliant and gives
// us a real ReadableStream on iOS and Android.
import { fetch } from 'expo/fetch';

import { createSseParser } from './sse';
import type { AgnoFile } from './types';

export type RunCallbacks = {
  /** Receives the FULL accumulated text so far (not a delta) — just assign it. */
  onDelta: (text: string) => void;
  onStatus: (status: 'thinking' | 'building' | 'streaming') => void;
  onDone: (finalText: string, files: AgnoFile[]) => void;
  onError: (message: string) => void;
};

export type RunArgs = {
  baseUrl: string;
  message: string;
  userId: string;
  sessionId: string;
};

export function normalizeBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function runAgent(
  { baseUrl, message, userId, sessionId }: RunArgs,
  cb: RunCallbacks,
  signal: AbortSignal,
): Promise<void> {
  // AgentOS uses FastAPI Form fields, so this is multipart/form-data, not JSON.
  const form = new FormData();
  form.append('message', message);
  form.append('stream', 'true');
  form.append('user_id', userId);
  form.append('session_id', sessionId);

  // Deliberately no Content-Type header — the multipart boundary is generated
  // for us, and supplying our own would drop or corrupt it.
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/agents/html/runs`, {
    method: 'POST',
    body: form,
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  if (!res.body) throw new Error('No response stream (is this expo/fetch?)');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const push = createSseParser();
  let acc = '';
  let sawContent = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream:true keeps multi-byte continuation state across chunks.
      for (const frame of push(decoder.decode(value, { stream: true }))) {
        let payload: any;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue; // ignore anything that is not well-formed JSON
        }

        switch (frame.event) {
          case 'ToolCallStarted':
            cb.onStatus('building');
            break;

          case 'RunContent': {
            // content arrives as incremental deltas
            if (typeof payload.content === 'string' && payload.content.length) {
              if (!sawContent) {
                sawContent = true;
                cb.onStatus('streaming');
              }
              acc += payload.content;
              cb.onDelta(acc);
            }
            break;
          }

          case 'RunCompleted': {
            const final = typeof payload.content === 'string' && payload.content ? payload.content : acc;
            cb.onDone(final, Array.isArray(payload.files) ? payload.files : []);
            return;
          }

          case 'RunError':
          case 'RunCancelled':
            cb.onError(String(payload.content ?? 'The run failed.'));
            return;
        }
      }
    }

    // Stream ended without a RunCompleted — treat whatever we got as final.
    cb.onDone(acc, []);
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * agno UTF-8 decodes `text/*` files, so `content` is already raw HTML.
 * The base64 branch is belt-and-braces in case that ever changes.
 */
export function extractHtml(file: AgnoFile): string | null {
  const raw = file.content;
  if (typeof raw !== 'string' || !raw.length) return null;
  if (raw.trimStart().startsWith('<')) return raw;
  try {
    const decoded = globalThis.atob ? globalThis.atob(raw) : null;
    if (decoded && decoded.trimStart().startsWith('<')) return decoded;
  } catch {
    // not base64 either — fall through
  }
  return raw;
}
