import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { attachToRun, cancelRun, extractHtml, runAgent, type RunCallbacks } from '@/lib/agent-client';
import { newId } from '@/lib/ids';
import * as store from '@/lib/storage';
import type { ChatMessage, ChatMeta, GeneratedApp, RunStatus } from '@/lib/types';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7777';

/** Don't auto re-attach to a run older than this — the record is stale. */
const PENDING_RUN_MAX_AGE_MS = 60 * 60 * 1000;

type Ctx = {
  ready: boolean;
  userId: string;
  apiUrl: string;
  setApiUrl: (url: string) => Promise<void>;

  chats: ChatMeta[];
  apps: GeneratedApp[];

  sessionId: string;
  messages: ChatMessage[];
  streamingText: string;
  status: RunStatus;

  send: (text: string) => Promise<void>;
  stopRun: () => void;
  newChat: () => void;
  openChat: (sessionId: string) => Promise<void>;
  removeChat: (sessionId: string) => Promise<void>;
  removeApp: (appId: string) => Promise<void>;
};

const ChandlerContext = createContext<Ctx | null>(null);

export function useChandler() {
  const ctx = useContext(ChandlerContext);
  if (!ctx) throw new Error('useChandler must be used inside <ChandlerProvider>');
  return ctx;
}

export function ChandlerProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');
  const [apiUrl, setApiUrlState] = useState(ENV_URL);

  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [apps, setApps] = useState<GeneratedApp[]>([]);

  const [sessionId, setSessionId] = useState(() => newId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');

  const abortRef = useRef<AbortController | null>(null);
  // The live background run, if any — needed to cancel it server-side.
  const runIdRef = useRef<string | null>(null);
  // Mirrors streamingText so the abort path reads the latest value rather than
  // whatever was captured when `send` was created.
  const streamingRef = useRef('');
  // Mirrors sessionId, but updated SYNCHRONOUSLY on switch, so run callbacks
  // that land after a chat switch never paint over the wrong session.
  const sessionRef = useRef(sessionId);

  const persistMessages = useCallback((sid: string, next: ChatMessage[]) => {
    setMessages(next);
    void store.saveMessages(sid, next);
  }, []);

  const upsertChat = useCallback(async (sid: string, title: string) => {
    const now = Date.now();
    setChats((prev) => {
      const existing = prev.find((c) => c.sessionId === sid);
      const next = existing
        ? [{ ...existing, updatedAt: now }, ...prev.filter((c) => c.sessionId !== sid)]
        : [{ sessionId: sid, title, createdAt: now, updatedAt: now }, ...prev];
      void store.saveChats(next);
      return next;
    });
  }, []);

  /**
   * Wires up the callbacks + finish handler for one run against one session.
   * Both `send` (new runs) and hydration (re-attaching after a restart) use it,
   * so recovery behaves exactly like a normal run.
   */
  const beginRun = useCallback((sid: string, base: ChatMessage[]) => {
    streamingRef.current = '';
    if (sessionRef.current === sid) setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;

    const finish = (msg: ChatMessage) => {
      if (finished) return;
      finished = true;
      void store.clearPendingRun();
      runIdRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      streamingRef.current = '';
      const next = [...base, msg];
      void store.saveMessages(sid, next);
      // The user may have switched chats while the run was recovering — always
      // persist the result, but never paint it over another session.
      if (sessionRef.current === sid) {
        setMessages(next);
        setStreamingText('');
        setStatus('idle');
      }
    };

    const callbacks: RunCallbacks = {
      onRunStarted: (runId) => {
        runIdRef.current = runId;
        // From here the run survives us; this record is how we find it again.
        void store.savePendingRun({ sessionId: sid, runId, createdAt: Date.now() });
      },
      onDelta: (t) => {
        streamingRef.current = t;
        if (sessionRef.current === sid) setStreamingText(t);
      },
      onStatus: (s) => {
        if (sessionRef.current === sid) setStatus(s);
      },
      onError: (message) =>
        finish({ id: newId(), role: 'error', text: message, createdAt: Date.now() }),
      onDone: (finalText, files) => {
        let appId: string | undefined;

        const htmlFile = files.find((f) => f.mime_type === 'text/html' || f.file_type === 'html');
        const html = htmlFile ? extractHtml(htmlFile) : null;

        if (htmlFile && html) {
          appId = htmlFile.id ?? newId();
          try {
            store.saveHtml(appId, html);
            const app: GeneratedApp = {
              id: appId,
              sessionId: sid,
              name: (htmlFile.filename ?? 'Untitled app').replace(/\.html$/i, ''),
              filename: htmlFile.filename ?? `${appId}.html`,
              size: htmlFile.size ?? html.length,
              createdAt: Date.now(),
            };
            setApps((prev) => {
              const next = [app, ...prev.filter((a) => a.id !== app.id)];
              void store.saveApps(next);
              return next;
            });
          } catch {
            appId = undefined; // couldn't persist; still show the text reply
          }
        }

        finish({
          id: newId(),
          role: 'assistant',
          text: finalText,
          appId,
          createdAt: Date.now(),
        });
      },
    };

    return { controller, callbacks, finish };
  }, []);

  // Hydrate once on mount; if a background run was in flight when the app last
  // closed, the server kept going — reopen that chat and re-attach to it.
  useEffect(() => {
    (async () => {
      const [uid, storedUrl, storedChats, storedApps, pending] = await Promise.all([
        store.getUserId(),
        store.getStoredApiUrl(),
        store.loadChats(),
        store.loadApps(),
        store.loadPendingRun(),
      ]);
      setUserId(uid);
      const url = storedUrl || ENV_URL;
      if (storedUrl) setApiUrlState(storedUrl);
      setChats(storedChats);
      setApps(storedApps);

      const fresh =
        pending && Date.now() - pending.createdAt < PENDING_RUN_MAX_AGE_MS ? pending : null;
      if (pending && !fresh) void store.clearPendingRun();

      // Resume the pending run's chat if there is one, else the most recent chat.
      const sid = fresh?.sessionId ?? storedChats[0]?.sessionId ?? null;
      let msgs: ChatMessage[] = [];
      if (sid) {
        msgs = await store.loadMessages(sid);
        sessionRef.current = sid;
        setSessionId(sid);
        setMessages(msgs);
      }
      setReady(true);

      if (fresh && sid) {
        setStatus('reconnecting');
        runIdRef.current = fresh.runId;
        const { controller, callbacks, finish } = beginRun(sid, msgs);
        try {
          await attachToRun(
            { baseUrl: url, runId: fresh.runId, sessionId: sid },
            callbacks,
            controller.signal,
          );
        } catch (err: any) {
          if (controller.signal.aborted) {
            const partial = streamingRef.current.trim();
            finish({
              id: newId(),
              role: partial ? 'assistant' : 'error',
              text: partial || 'Run cancelled.',
              createdAt: Date.now(),
            });
            return;
          }
          finish({
            id: newId(),
            role: 'error',
            text: `Couldn't recover the previous run. ${err?.message ?? ''}`.trim(),
            createdAt: Date.now(),
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    setApiUrlState(url);
    await store.setStoredApiUrl(url);
  }, []);

  /**
   * Stop the active run for real: background runs outlive our socket, so we
   * must tell the server, not just abort the fetch.
   */
  const cancelActiveRun = useCallback(() => {
    const runId = runIdRef.current;
    if (runId) void cancelRun(apiUrl, runId, sessionRef.current);
    runIdRef.current = null;
    void store.clearPendingRun();
    abortRef.current?.abort();
    abortRef.current = null;
  }, [apiUrl]);

  const stopRun = cancelActiveRun;

  const newChat = useCallback(() => {
    cancelActiveRun();
    const sid = newId();
    sessionRef.current = sid;
    setSessionId(sid);
    setMessages([]);
    setStreamingText('');
    setStatus('idle');
  }, [cancelActiveRun]);

  const openChat = useCallback(
    async (sid: string) => {
      cancelActiveRun();
      sessionRef.current = sid;
      setSessionId(sid);
      setStreamingText('');
      setStatus('idle');
      setMessages(await store.loadMessages(sid));
    },
    [cancelActiveRun],
  );

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || status !== 'idle' || !userId) return;

      const sid = sessionId;
      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        text: body,
        createdAt: Date.now(),
      };
      const base = [...messages, userMsg];
      persistMessages(sid, base);
      void upsertChat(sid, body.slice(0, 40));
      setStatus('thinking');

      const { controller, callbacks, finish } = beginRun(sid, base);
      try {
        await runAgent({ baseUrl: apiUrl, message: body, userId, sessionId: sid }, callbacks, controller.signal);
      } catch (err: any) {
        if (controller.signal.aborted) {
          // User pressed stop or switched chats — keep whatever streamed in.
          const partial = streamingRef.current.trim();
          finish({
            id: newId(),
            role: partial ? 'assistant' : 'error',
            text: partial || 'Run cancelled.',
            createdAt: Date.now(),
          });
          return;
        }
        finish({
          id: newId(),
          role: 'error',
          text: `Couldn't reach the server at ${apiUrl}. ${err?.message ?? ''}`.trim(),
          createdAt: Date.now(),
        });
      }
    },
    [apiUrl, beginRun, messages, persistMessages, sessionId, status, upsertChat, userId],
  );

  const removeChat = useCallback(
    async (sid: string) => {
      await store.deleteChat(sid);
      setChats((prev) => prev.filter((c) => c.sessionId !== sid));
      if (sid === sessionId) newChat();
    },
    [newChat, sessionId],
  );

  const removeApp = useCallback(async (appId: string) => {
    store.deleteHtml(appId);
    setApps((prev) => {
      const next = prev.filter((a) => a.id !== appId);
      void store.saveApps(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      userId,
      apiUrl,
      setApiUrl,
      chats,
      apps,
      sessionId,
      messages,
      streamingText,
      status,
      send,
      stopRun,
      newChat,
      openChat,
      removeChat,
      removeApp,
    }),
    [
      ready,
      userId,
      apiUrl,
      setApiUrl,
      chats,
      apps,
      sessionId,
      messages,
      streamingText,
      status,
      send,
      stopRun,
      newChat,
      openChat,
      removeChat,
      removeApp,
    ],
  );

  return <ChandlerContext.Provider value={value}>{children}</ChandlerContext.Provider>;
}
