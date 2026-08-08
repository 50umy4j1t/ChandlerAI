import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { extractHtml, runAgent } from '@/lib/agent-client';
import { newId } from '@/lib/ids';
import * as store from '@/lib/storage';
import type { ChatMessage, ChatMeta, GeneratedApp, RunStatus } from '@/lib/types';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7777';

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

  // Hydrate once on mount.
  useEffect(() => {
    (async () => {
      const [uid, storedUrl, storedChats, storedApps] = await Promise.all([
        store.getUserId(),
        store.getStoredApiUrl(),
        store.loadChats(),
        store.loadApps(),
      ]);
      setUserId(uid);
      if (storedUrl) setApiUrlState(storedUrl);
      setChats(storedChats);
      setApps(storedApps);

      // Resume the most recent chat rather than opening a dead empty one.
      if (storedChats.length) {
        setSessionId(storedChats[0].sessionId);
        setMessages(await store.loadMessages(storedChats[0].sessionId));
      }
      setReady(true);
    })();
  }, []);

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

  const setApiUrl = useCallback(async (url: string) => {
    setApiUrlState(url);
    await store.setStoredApiUrl(url);
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSessionId(newId());
    setMessages([]);
    setStreamingText('');
    setStatus('idle');
  }, []);

  const openChat = useCallback(async (sid: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSessionId(sid);
    setStreamingText('');
    setStatus('idle');
    setMessages(await store.loadMessages(sid));
  }, []);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

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

      setStreamingText('');
      setStatus('thinking');

      const controller = new AbortController();
      abortRef.current = controller;

      const finish = (msg: ChatMessage) => {
        persistMessages(sid, [...base, msg]);
        setStreamingText('');
        setStatus('idle');
        abortRef.current = null;
      };

      try {
        await runAgent(
          { baseUrl: apiUrl, message: body, userId, sessionId: sid },
          {
            onDelta: setStreamingText,
            onStatus: setStatus,
            onError: (message) =>
              finish({ id: newId(), role: 'error', text: message, createdAt: Date.now() }),
            onDone: (finalText, files) => {
              let appId: string | undefined;

              const htmlFile = files.find(
                (f) => f.mime_type === 'text/html' || f.file_type === 'html',
              );
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
          },
          controller.signal,
        );
      } catch (err: any) {
        if (controller.signal.aborted) {
          // User pressed stop — keep whatever streamed in.
          const partial = streamingText.trim();
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
    [apiUrl, messages, persistMessages, sessionId, status, streamingText, upsertChat, userId],
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
