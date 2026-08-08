/** File object as serialised by agno's `File.to_dict()`. */
export type AgnoFile = {
  id?: string;
  url?: string;
  filepath?: string;
  /** For `text/*` mime types agno UTF-8 decodes this, so it is raw HTML. */
  content?: string;
  mime_type?: string;
  file_type?: string;
  filename?: string;
  size?: number;
};

export type ChatMeta = {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** Set when this reply produced a generated app. */
  appId?: string;
  createdAt: number;
};

export type GeneratedApp = {
  id: string;
  sessionId: string;
  name: string;
  filename: string;
  size: number;
  createdAt: number;
};

export type RunStatus = 'idle' | 'thinking' | 'building' | 'streaming';
