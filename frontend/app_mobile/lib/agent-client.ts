// MANDATORY: React Native's global fetch does not expose `response.body`, so
// streaming is impossible with it. expo/fetch is WinterCG-compliant and gives
// us a real ReadableStream on iOS and Android.
import { fetch } from 'expo/fetch';

import { createSseParser, type SseFrame } from './sse';
import type { AgnoFile, RunStatus } from './types';

export type RunPhase = Exclude<RunStatus, 'idle'>;

export type RunCallbacks = {
  /**
   * Fires once, as soon as the server assigns a run id. Runs start with
   * background=true, so from this moment the run survives without us —
   * persist the id and it can be re-attached even after an app restart.
   */
  onRunStarted?: (runId: string) => void;
  /** Receives the FULL accumulated text so far (not a delta) — just assign it. */
  onDelta: (text: string) => void;
  onStatus: (status: RunPhase) => void;
  onDone: (finalText: string, files: AgnoFile[]) => void;
  onError: (message: string) => void;
};

export type RunArgs = {
  baseUrl: string;
  message: string;
  userId: string;
  sessionId: string;
};

export type AttachArgs = {
  baseUrl: string;
  runId: string;
  sessionId: string;
};

const AGENT_ID = 'html';

/**
 * No bytes at all for this long → assume the socket is dead and re-attach.
 * The initial background stream has no server heartbeat (only /resume streams
 * do, every 30s), so this must sit through slow tool-call generation.
 */
const STALL_MS = 90_000;
/** Budget for connect + response headers on any single request. */
const CONNECT_MS = 15_000;
/** Reconnect delays; the last entry repeats. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** Give up after this many consecutive failed recovery attempts (~4 min offline). */
const MAX_FAILURES = 20;
/** A run the server repeatedly says it has never heard of is genuinely gone. */
const MAX_NOT_FOUND = 5;

export function normalizeBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

type StreamState = {
  acc: string;
  sawContent: boolean;
  runId: string | null;
  /** Highest event_index processed so far; -1 = nothing yet. */
  lastEventIndex: number;
  /** A terminal callback (onDone/onError) has fired — stop everything. */
  done: boolean;
};

const abortError = () => new Error('Aborted');

/** A controller for one connection that also fires when the caller aborts the run. */
function linkedController(signal: AbortSignal) {
  const ctrl = new AbortController();
  if (signal.aborted) ctrl.abort();
  else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  return ctrl;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** fetch that aborts `conn` if the server hasn't answered with headers in time. */
async function fetchWithTimeout(url: string, init: Parameters<typeof fetch>[1], conn: AbortController) {
  const timer = setTimeout(() => conn.abort(), CONNECT_MS);
  try {
    return await fetch(url, { ...init, signal: conn.signal });
  } finally {
    clearTimeout(timer);
  }
}

function handleFrame(frame: SseFrame, state: StreamState, cb: RunCallbacks) {
  let payload: any;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return; // ignore anything that is not well-formed JSON
  }

  if (typeof payload?.run_id === 'string' && !state.runId) {
    state.runId = payload.run_id;
    cb.onRunStarted?.(payload.run_id);
  }

  // Resumed streams replay history; event_index lets us drop what we already have.
  if (typeof payload?.event_index === 'number') {
    if (payload.event_index <= state.lastEventIndex) return;
    state.lastEventIndex = payload.event_index;
  }

  switch (frame.event) {
    case 'ToolCallStarted':
      cb.onStatus('building');
      break;

    case 'RunContent': {
      // content arrives as incremental deltas
      if (typeof payload.content === 'string' && payload.content.length) {
        if (!state.sawContent) {
          state.sawContent = true;
          cb.onStatus('streaming');
        }
        state.acc += payload.content;
        cb.onDelta(state.acc);
      }
      break;
    }

    case 'RunCompleted': {
      state.done = true;
      const final = typeof payload.content === 'string' && payload.content ? payload.content : state.acc;
      cb.onDone(final, Array.isArray(payload.files) ? payload.files : []);
      break;
    }

    case 'RunError':
    case 'RunCancelled':
      state.done = true;
      cb.onError(String(payload.content ?? 'The run failed.'));
      break;

    // replay / catch_up / subscribed meta frames are informational only; if a
    // replay ends without a terminal event, the attach loop's status poll decides.
  }
}

/**
 * Read one SSE connection until a terminal event (state.done), a clean end,
 * a network error, or a stall. Throws on error/stall; the caller recovers.
 */
async function consumeStream(
  res: Awaited<ReturnType<typeof fetch>>,
  state: StreamState,
  cb: RunCallbacks,
  conn: AbortController,
): Promise<void> {
  if (!res.body) throw new Error('No response stream (is this expo/fetch?)');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const push = createSseParser();

  try {
    for (;;) {
      let stall: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          stall = setTimeout(() => reject(new Error('Stream stalled.')), STALL_MS);
        }),
      ]).finally(() => clearTimeout(stall));
      if (result.done) return;

      // stream:true keeps multi-byte continuation state across chunks.
      for (const frame of push(decoder.decode(result.value, { stream: true }))) {
        handleFrame(frame, state, cb);
        if (state.done) return;
      }
    }
  } finally {
    // Also kills a read still parked behind the stall timeout.
    conn.abort();
    reader.cancel().catch(() => {});
  }
}

/**
 * Recovery loop for a live background run:
 * 1. Poll GET /runs/{id} — the authoritative status, and the only source left
 *    once the server's in-memory event buffer is gone. Terminal states finish here.
 * 2. If still active, re-attach live via POST /runs/{id}/resume with
 *    last_event_index, which replays only what we missed then streams onward.
 * Backs off between failures and only gives up after MAX_FAILURES in a row.
 */
async function attachLoop(
  baseUrl: string,
  sessionId: string,
  state: StreamState,
  cb: RunCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  const runId = state.runId;
  if (!runId) throw new Error('Run was never started.');

  // First content after a re-attach should flip status back to `streaming`.
  state.sawContent = false;
  cb.onStatus('reconnecting');

  let failures = 0;
  let notFound = 0;

  for (;;) {
    if (signal.aborted) throw abortError();

    let active = false;
    try {
      const conn = linkedController(signal);
      const res = await fetchWithTimeout(
        `${base}/agents/${AGENT_ID}/runs/${runId}?session_id=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        conn,
      );
      if (res.ok) {
        notFound = 0;
        const run: any = await res.json();
        const status = String(run?.status ?? '').toUpperCase();
        if (status === 'COMPLETED') {
          state.done = true;
          const text = typeof run?.content === 'string' && run.content ? run.content : state.acc;
          cb.onDone(text, Array.isArray(run?.files) ? run.files : []);
          return;
        }
        if (status === 'ERROR') {
          state.done = true;
          cb.onError('The run failed on the server.');
          return;
        }
        if (status === 'CANCELLED') {
          state.done = true;
          cb.onError('The run was cancelled.');
          return;
        }
        // PENDING / RUNNING / PAUSED → try a live re-attach below.
        active = true;
        failures = 0;
      } else if (res.status === 404) {
        // Right after starting, the run row may not be committed yet — retry,
        // but a run that stays unknown is gone for good.
        failures += 1;
        notFound += 1;
        if (notFound >= MAX_NOT_FOUND) {
          state.done = true;
          cb.onError('The server no longer knows about this run.');
          return;
        }
      } else {
        failures += 1;
      }
    } catch (err) {
      if (signal.aborted) throw err;
      failures += 1;
    }

    if (active) {
      try {
        const conn = linkedController(signal);
        const form = new FormData();
        form.append('session_id', sessionId);
        if (state.lastEventIndex >= 0) form.append('last_event_index', String(state.lastEventIndex));
        const res = await fetchWithTimeout(
          `${base}/agents/${AGENT_ID}/runs/${runId}/resume`,
          { method: 'POST', body: form, headers: { Accept: 'text/event-stream' } },
          conn,
        );
        if (res.ok) {
          const before = state.lastEventIndex;
          await consumeStream(res, state, cb, conn);
          if (state.done) return;
          if (state.lastEventIndex > before) {
            // We made progress before this drop — it was transient, start fresh.
            failures = 0;
            state.sawContent = false;
            cb.onStatus('reconnecting');
          }
        } else {
          failures += 1;
        }
      } catch (err) {
        if (signal.aborted) throw err;
        failures += 1;
      }
    }

    if (failures >= MAX_FAILURES) {
      state.done = true;
      cb.onError('Lost the connection to the server and could not recover.');
      return;
    }
    await delay(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)], signal);
  }
}

export async function runAgent(args: RunArgs, cb: RunCallbacks, signal: AbortSignal): Promise<void> {
  const state: StreamState = { acc: '', sawContent: false, runId: null, lastEventIndex: -1, done: false };
  const base = normalizeBaseUrl(args.baseUrl);

  // AgentOS uses FastAPI Form fields, so this is multipart/form-data, not JSON.
  const form = new FormData();
  form.append('message', args.message);
  form.append('stream', 'true');
  // background=true detaches the run server-side: it keeps executing through
  // client disconnects, and GET /runs/{id} + /resume let us recover it.
  form.append('background', 'true');
  form.append('user_id', args.userId);
  form.append('session_id', args.sessionId);

  try {
    const conn = linkedController(signal);
    // Deliberately no Content-Type header — the multipart boundary is generated
    // for us, and supplying our own would drop or corrupt it.
    const res = await fetchWithTimeout(
      `${base}/agents/${AGENT_ID}/runs`,
      { method: 'POST', body: form, headers: { Accept: 'text/event-stream' } },
      conn,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
    }
    await consumeStream(res, state, cb, conn);
  } catch (err) {
    if (signal.aborted) throw err;
    // The run never reached the server — nothing to recover, report as-is.
    if (!state.runId) throw err;
    // Otherwise the run is alive server-side; fall through and go get it back.
  }

  if (state.done) return;
  if (!state.runId) throw new Error('The stream ended before the run started.');
  await attachLoop(args.baseUrl, args.sessionId, state, cb, signal);
}

/**
 * Re-attach to a background run started earlier (e.g. before an app restart).
 * Replays the whole event stream from index 0, so the delta text rebuilds
 * from scratch and the final message is identical to an uninterrupted run.
 */
export async function attachToRun(
  { baseUrl, runId, sessionId }: AttachArgs,
  cb: RunCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const state: StreamState = { acc: '', sawContent: false, runId, lastEventIndex: -1, done: false };
  await attachLoop(baseUrl, sessionId, state, cb, signal);
}

/**
 * Best-effort server-side cancel. A background run outlives a dropped socket,
 * so Stop must tell the server — merely aborting our fetch no longer stops it.
 */
export async function cancelRun(baseUrl: string, runId: string, sessionId: string): Promise<void> {
  try {
    await fetch(
      `${normalizeBaseUrl(baseUrl)}/agents/${AGENT_ID}/runs/${runId}/cancel?session_id=${encodeURIComponent(sessionId)}`,
      { method: 'POST' },
    );
  } catch {
    // If this fails the run just finishes unwatched; the caller clears the
    // pending-run record either way.
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
