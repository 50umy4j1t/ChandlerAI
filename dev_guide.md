# Developer Guide

Everything you need to run, debug, and extend Chandler's AI.

**Toolchain is non-negotiable: `uv` for Python, `pnpm` for Node.** Don't use pip, npm, or yarn in this repo — mixing them produces a lockfile mess and, for React Native specifically, a `node_modules` layout Metro can't resolve.

---

## 1. Prerequisites

| Tool | Check | Install |
|---|---|---|
| uv | `uv --version` | `winget install astral-sh.uv` |
| pnpm | `pnpm --version` | `npm i -g pnpm` or `winget install pnpm.pnpm` |
| Node 20+ | `node --version` | `winget install OpenJS.NodeJS.LTS` |
| Expo Go | on your phone | App Store / Play Store |

Plus a **Gemini API key** from [aistudio.google.com](https://aistudio.google.com/apikey).

---

## 2. Backend setup (uv)

```powershell
cd D:\programs\repos\chandlerAI\backend

# Creates .venv and installs from pyproject.toml
uv sync

# Secrets
Copy-Item .env.example .env
notepad .env          # set GOOGLE_API_KEY=...
```

Run it:

```powershell
uv run python agent.py
```

`uv run` uses the project venv without you activating anything. You should see uvicorn bind to `0.0.0.0:7777`.

Sanity check from the dev machine:

```powershell
curl http://localhost:7777/health
```

### Why `0.0.0.0`

`agent.py` binds all interfaces so a phone on the same Wi-Fi can reach it. `localhost` would only accept connections from the machine itself.

### uv cheatsheet

| Task | Command |
|---|---|
| Install deps | `uv sync` |
| Add a package | `uv add <pkg>` |
| Remove a package | `uv remove <pkg>` |
| Run a script | `uv run python agent.py` |
| Regenerate requirements.txt | `uv pip compile pyproject.toml -o requirements.txt` |
| One-off tool | `uv run --with <pkg> python -c "..."` |

---

## 3. Frontend setup (pnpm)

```powershell
cd D:\programs\repos\chandlerAI\frontend\app_mobile
pnpm install
```

### The one pnpm gotcha: `node-linker=hoisted`

`.npmrc` in `frontend/app_mobile` contains:

```
node-linker=hoisted
```

**Do not remove this.** pnpm's default symlinked `node_modules` breaks Metro, which can't follow the symlinks and fails with module-resolution errors. `hoisted` gives a flat layout like npm while keeping pnpm's fast, deduped store.

If you ever see mysterious "unable to resolve module" errors, first confirm `.npmrc` is intact, then:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm install
pnpm start -- --clear
```

### Install the native deps

Already installed, but if you're starting from a clean clone use `expo install` (not `pnpm add`) so versions match the SDK:

```powershell
npx expo install react-native-webview @react-native-async-storage/async-storage expo-crypto expo-file-system
```

### Point the app at your machine

```powershell
ipconfig     # copy the IPv4 Address under your Wi-Fi adapter
Copy-Item .env.example .env
notepad .env
```

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:7777
```

`EXPO_PUBLIC_*` vars are inlined at bundle time, so **restart Metro after editing `.env`**. You can also override the URL at runtime in the app's Settings screen — handy when your DHCP lease changes.

### Run

```powershell
pnpm start
```

Scan the QR code with Expo Go. Press `r` to reload, `j` to open the debugger.

---

## 4. Windows firewall

If the phone times out but `curl http://localhost:7777/health` works on the dev machine, the firewall is blocking inbound 7777. Python usually prompts on first bind; if you dismissed it:

```powershell
# run as Administrator
New-NetFirewallRule -DisplayName "Chandler AI 7777" -Direction Inbound -LocalPort 7777 -Protocol TCP -Action Allow -Profile Private
```

Also confirm your Wi-Fi is set to **Private**, not Public, and that both devices are on the same subnet (guest networks and client isolation will break this).

---

## 5. The agno wire contract

All of this is traced from agno 2.8.7's source, and all of it lives in `lib/agent-client.ts`.

### Request

`POST /agents/html/runs` — **`multipart/form-data`**, because AgentOS uses FastAPI `Form` fields. Sending JSON returns 422.

| Field | Value |
|---|---|
| `message` | the user's prompt |
| `stream` | `"true"` |
| `user_id` | persisted UUID, one per install |
| `session_id` | UUID, one per chat |

> **Never set `Content-Type` manually.** The multipart boundary is generated for you; supplying your own header drops or corrupts it.

### Response

`text/event-stream`, framed as `event: <Name>\ndata: <json>\n\n`.

| Event | Payload | Handling |
|---|---|---|
| `RunStarted` | `run_id`, `session_id` | ignored |
| `ToolCallStarted` | `tools[]` | status → "building" |
| `RunContent` | `content` — an **incremental delta** | append |
| `RunCompleted` | final `content` + **`files[]`** | commit message, save HTML |
| `RunError` / `RunCancelled` | `content` = message | themed error bubble |

### The file object

```jsonc
{
  "id": "…", "filename": "snake.html", "mime_type": "text/html",
  "size": 8213, "filepath": "D:\\…\\backend\\tmp\\snake.html",
  "content": "<!doctype html>…"   // raw string, NOT base64
}
```

agno's `File.to_dict()` UTF-8-decodes bytes whenever `mime_type` starts with `text/`, and `generate_html_file` sets `text/html`. So `content` is plain HTML. `extractHtml()` still has a base64 fallback in case that ever changes.

---

## 6. Why `expo/fetch`

```ts
import { fetch } from 'expo/fetch';
```

**React Native's global `fetch` does not expose `response.body`**, so streaming is impossible with it — you'd have to wait for the whole response. `expo/fetch` is WinterCG-compliant and gives a real `ReadableStream` on iOS and Android. This import is load-bearing; don't "clean it up".

`TextDecoder` is a global (installed by Expo's WinterCG runtime) and its `decode(chunk, { stream: true })` keeps multi-byte continuation state, so emoji split across chunk boundaries decode correctly.

---

## 7. Code map

```
frontend/app_mobile/
├── app/
│   ├── _layout.tsx           root stack, mounts ChandlerProvider
│   ├── (tabs)/_layout.tsx    three tabs
│   ├── (tabs)/index.tsx      Central Perk — the chat
│   ├── (tabs)/chats.tsx      The Gang — past chats
│   ├── (tabs)/archive.tsx    The Archive — generated apps
│   ├── viewer.tsx            full-screen sandboxed WebView
│   └── settings.tsx          backend URL + connection test
├── lib/
│   ├── agent-client.ts       ← the ONLY file that knows about agno
│   ├── sse.ts                chunk-safe SSE frame parser
│   ├── storage.ts            AsyncStorage metadata + filesystem HTML
│   ├── types.ts              shared types
│   └── ids.ts                UUIDs via expo-crypto
├── providers/
│   └── chandler-provider.tsx app-wide state, no state library
├── components/chat/          message-bubble, composer, typing-indicator
└── constants/
    ├── theme.ts              Central Perk palette, light + dark
    └── chandler.ts           the one-liners
```

Screens never call `fetch` — they only use `useChandler()`. To swap backends, change `agent-client.ts` and nothing else.

---

## 8. Storage model

Metadata is small and goes in AsyncStorage. HTML blobs are 10–100KB and would blow Android's AsyncStorage size cap, so they go to the filesystem.

```
AsyncStorage
  chandler:user_id       uuid, minted once per install
  chandler:api_url       Settings override of EXPO_PUBLIC_API_URL
  chandler:chats         ChatMeta[]  { sessionId, title, createdAt, updatedAt }
  chandler:msgs:<sid>    ChatMessage[] { id, role, text, appId?, createdAt }
  chandler:apps          GeneratedApp[] { id, sessionId, name, filename, size, createdAt }

Filesystem
  <documentDirectory>/apps/<appId>.html
```

Wiping the app's data resets `user_id` and orphans nothing — HTML files live under the same sandbox.

---

## 9. WebView sandboxing

Generated HTML is model output, so `app/viewer.tsx` locks it down:

| Prop | Why |
|---|---|
| `onShouldStartLoadWithRequest` | blocks **all** outbound navigation |
| `allowFileAccess={false}` | no reading the device filesystem |
| `allowUniversalAccessFromFileURLs={false}` | no cross-origin reads |
| `setSupportMultipleWindows={false}` | no popups |
| `originWhitelist={['*']}` | needed for `source={{html}}`; navigation is blocked above |

`javaScriptEnabled` stays on — the generated apps are JS games and are useless without it. The agent is instructed to inline everything and make no network requests, so nothing legitimate is lost.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Reply arrives all at once | RN's global `fetch` got used | ensure `import { fetch } from 'expo/fetch'` |
| `422 Unprocessable Entity` | sent JSON instead of form fields | use `FormData`, no `Content-Type` |
| Network request failed | phone can't see the machine | LAN IP in `.env`, firewall, same Wi-Fi |
| Unable to resolve module | pnpm symlinks | `.npmrc` must have `node-linker=hoisted`; reinstall |
| 503 from Gemini | model overloaded | retry; it's upstream |
| Backend won't start | no API key | `GOOGLE_API_KEY` in `backend/.env` |
| Blank tab icon | SF Symbol not mapped | add it to `MAPPING` in `components/ui/icon-symbol.tsx` |
| App opens blank | HTML file missing on disk | check The Archive; regenerate |

### Watching the stream by hand

```powershell
curl -N -X POST http://localhost:7777/agents/html/runs `
  -F "message=make a snake game" -F "stream=true" `
  -F "user_id=test" -F "session_id=test-1"
```

You should see `event: RunContent` frames arriving progressively, then one `event: RunCompleted` carrying `files`.

---

## 11. Checks before committing

```powershell
cd frontend\app_mobile
pnpm typecheck      # tsc --noEmit
pnpm lint
```

Note the `MAPPING` cast in `icon-symbol.tsx` means an unmapped icon name **passes typecheck but renders blank at runtime** — add the mapping when you add an icon.

---

## 12. Extending it

- **Change the agent's behaviour** — edit `instructions` in `backend/agent.py`
- **Another file type** — `FileGenerationTools` also does json/csv/txt; add a branch in `chandler-provider.tsx`'s `onDone`
- **Show tool progress** — `ToolCallStarted`/`ToolCallCompleted` carry a `tools[]` array with names
- **Recolour** — everything derives from `Palette` in `constants/theme.ts`
- **PDF/DOCX generation** — `uv add reportlab python-docx`, then agno enables those generators automatically
