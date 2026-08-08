/**
 * Metadata lives in AsyncStorage; generated HTML lives on the filesystem.
 * HTML blobs run 10-100KB and AsyncStorage is size-capped on Android, so
 * keeping them out of it matters.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './ids';
import type { ChatMeta, ChatMessage, GeneratedApp } from './types';

const K = {
  userId: 'chandler:user_id',
  apiUrl: 'chandler:api_url',
  chats: 'chandler:chats',
  apps: 'chandler:apps',
  msgs: (sessionId: string) => `chandler:msgs:${sessionId}`,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

/* ------------------------------- identity ------------------------------- */

export async function getUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(K.userId);
  if (existing) return existing;
  const id = newId();
  await AsyncStorage.setItem(K.userId, id);
  return id;
}

export const getStoredApiUrl = () => AsyncStorage.getItem(K.apiUrl);
export const setStoredApiUrl = (url: string) => AsyncStorage.setItem(K.apiUrl, url);

/* --------------------------------- chats -------------------------------- */

export const loadChats = () => readJson<ChatMeta[]>(K.chats, []);
export const saveChats = (chats: ChatMeta[]) => writeJson(K.chats, chats);

export const loadMessages = (sessionId: string) => readJson<ChatMessage[]>(K.msgs(sessionId), []);
export const saveMessages = (sessionId: string, messages: ChatMessage[]) =>
  writeJson(K.msgs(sessionId), messages);

export async function deleteChat(sessionId: string) {
  await AsyncStorage.removeItem(K.msgs(sessionId));
  const chats = await loadChats();
  await saveChats(chats.filter((c) => c.sessionId !== sessionId));
}

/* --------------------------------- apps --------------------------------- */

export const loadApps = () => readJson<GeneratedApp[]>(K.apps, []);
export const saveApps = (apps: GeneratedApp[]) => writeJson(K.apps, apps);

function appsDir() {
  const dir = new Directory(Paths.document, 'apps');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function saveHtml(appId: string, html: string) {
  const file = new File(appsDir(), `${appId}.html`);
  if (file.exists) file.delete();
  file.create();
  file.write(html);
}

export function readHtml(appId: string): string | null {
  try {
    const file = new File(appsDir(), `${appId}.html`);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

export function deleteHtml(appId: string) {
  try {
    const file = new File(appsDir(), `${appId}.html`);
    if (file.exists) file.delete();
  } catch {
    // best effort — metadata removal is what the UI keys off
  }
}
