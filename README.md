# Chandler's AI

> *Can this app BE any more of what I want it to be?*

Ask for an app in plain English. An agno agent writes a self-contained, mobile-friendly HTML5 file and it opens full-screen in your phone, right there in the chat.

Friends-themed, streaming, and entirely local to your machine.

---

## What it is

| | |
|---|---|
| **Backend** | Python + [agno](https://docs.agno.com) `AgentOS` (FastAPI) on port `7777`, Gemini model, `FileGenerationTools` |
| **Frontend** | Expo SDK 54 / React Native 0.81 / expo-router 6, TypeScript |
| **Package managers** | **uv** for Python, **pnpm** for Node — no exceptions |

The agent replies with a sentence or two of chat text *and* an HTML file. The app streams the text token-by-token as it arrives, then offers an **Open the app** button that renders the HTML in a sandboxed WebView.

## How it hangs together

```
 phone                         dev machine
┌──────────────────┐          ┌──────────────────────────────┐
│ Expo app         │          │ agno AgentOS  :7777          │
│                  │  POST    │                              │
│ lib/agent-client ├─────────►│ /agents/html/runs            │
│                  │  multipart│   message, stream=true,      │
│                  │           │   user_id, session_id        │
│                  │◄─────────┤ text/event-stream            │
│ lib/sse.ts       │   SSE     │   RunContent  → text deltas  │
│                  │           │   RunCompleted→ files[].html │
│ WebView          │           └──────────────┬───────────────┘
│  ← HTML string   │                          │
└──────────────────┘                          ▼
                                     backend/tmp/*.html
```

The generated HTML comes back **as a raw string**, not base64 — agno UTF-8-decodes anything with a `text/*` mime type. It's saved to the device filesystem and rendered from there.

## Quick start

You need [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/), and a Google/Gemini API key.

```bash
# backend
cd backend
uv sync
cp .env.example .env          # add your GOOGLE_API_KEY
uv run python agent.py        # serves 0.0.0.0:7777

# frontend (second terminal)
cd frontend/app_mobile
pnpm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL to your LAN IP
pnpm start                    # scan the QR with Expo Go
```

Your phone can't see `localhost` — put your machine's LAN IP in `.env`. Full walkthrough, including the Windows commands and firewall notes, is in **[dev_guide.md](./dev_guide.md)**.

## Features

- **Streaming replies** — real SSE, text appears as the model produces it
- **Persistent identity** — a `user_id` UUID minted once per install
- **Per-chat sessions** — every new chat mints a `session_id`, so the agent keeps context within a conversation and forgets across them
- **The Archive** — every generated app is kept and reopenable
- **In-app settings** — retype the backend URL when your IP changes, with a connection test
- **Sandboxed WebView** — generated HTML can't navigate anywhere or touch the filesystem

## Screens

| Tab | Name | What it does |
|---|---|---|
| 1 | Central Perk | The chat. Streams replies, opens generated apps |
| 2 | The Gang | Past chats — tap to resume with its original `session_id` |
| 3 | The Archive | Every generated app, reopenable any time |

Plus two modals: the full-screen **viewer** and **settings**.

## Layout

```
chandlerAI/
├── backend/
│   ├── agent.py            agno AgentOS server
│   ├── pyproject.toml      uv dependencies
│   └── tmp/                sqlite db + generated html  (gitignored)
└── frontend/app_mobile/
    ├── app/                expo-router screens
    ├── lib/                agno client, SSE parser, storage
    ├── providers/          app-wide state
    ├── components/         chat UI + themed primitives
    └── constants/          palette and Chandler-isms
```

## License

Private project. Friends is a trademark of Warner Bros.; this is an unaffiliated hobby build.
