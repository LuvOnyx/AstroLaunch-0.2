# AstroLaunch

Next-generation IDE + Design Workstation — Next.js 15 web app + Electron 33 desktop app. Monaco code editor, Penpot canvas, WebContainer live preview, xterm.js terminal, multi-agent AI (Gemini/Claude/Ollama), plugin SDK.

## Run & Operate

| Command | Purpose |
|---|---|
| `cd astrolaunch && npm run dev` | Start web app on port 5000 (Replit preview) |
| `cd astrolaunch && npm run build` | Production Next.js build |
| `cd astrolaunch && npm run electron:build` | Build Windows/macOS/Linux desktop installers → `/release` |
| `cd astrolaunch && npm run typecheck` | TypeScript check |

**Required env vars:** None at startup — API keys set in-app via Settings → Agents tab.

## Stack

- **Frontend/Web:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 3, Framer Motion
- **Desktop:** Electron 33, electron-builder
- **Editor:** Monaco Editor
- **State:** Zustand + Jotai
- **Storage:** Dexie (IndexedDB)
- **AI:** Google Gemini (`@google/generative-ai`), Claude (raw fetch), Ollama (raw fetch)
- **Animations:** animejs v4 (installed), Framer Motion
- **Terminal:** xterm.js inside WebContainer (`@webcontainer/api`)
- **Package manager:** npm 10, Node.js 20

## Where things live

- `astrolaunch/src/app/` — Next.js App Router (pages + API routes)
- `astrolaunch/src/app/api/agents/` — chat, execute, plan, image API routes (multi-provider)
- `astrolaunch/src/components/agent-chat/` — FloatingAgentChat, ModeSwitch, ReasoningBlock, AttachmentBar, MessageView
- `astrolaunch/src/components/terminal/` — TerminalPanel (xterm + WebContainer jsh)
- `astrolaunch/src/lib/agents/` — orchestrator, tools, model-router, pricing, personas
- `astrolaunch/src/store/settings.ts` — all user settings incl. model + API key config
- `astrolaunch/src/types/index.ts` — all domain types
- `astrolaunch/next.config.mjs` — COEP/COOP headers for WebContainers

## Architecture decisions

- **Multi-model routing:** `src/lib/agents/model-router.ts` is the server-side abstraction — Gemini uses `@google/generative-ai`, Claude + Ollama use raw `fetch()` so no extra SDKs needed
- **Planning/Agent switch** replaces the old `/build` prefix — "Planning" triggers the Architect→Builder→Reviewer loop, "Agent" is streaming chat
- **Free image generation** auto-triggered when user message contains "generate/create/draw an image…" using `gemini-2.0-flash-preview-image-generation` (free tier)
- **Rate limiting** handled in orchestrator v3: exponential backoff on 429, configurable inter-iteration delay, jitter to avoid thundering herd
- **is_done improvements:** reviewer requires concrete evidence (≥20 chars) + at least 1 confirmed positive review before marking done; consecutive positive reviews accumulate
- COEP/COOP headers (`require-corp` / `same-origin`) set in `next.config.mjs` — required for WebContainer API
- Dexie v3 schema persists files, chats, messages, tasks, plugins, terminals, usage in IndexedDB
- Plugin SDK uses sandboxed iframes + postMessage; permissions validated via Zod

## Product

- Monaco code editor with AI inline edit (⌘I)
- Multi-agent loop: Architect → Builder → Reviewer powered by Gemini / Claude / Ollama
- **Planning mode** (new): switch in chat header runs full agent loop — no `/build` prefix needed
- **Agent mode** (new): streaming chat with auto-persona routing (Astronaught system)
- **File + image attachment** in chat: inject files as context, images as vision multimodal input
- **Reasoning dropdown** (new): click to reveal agent's thinking tokens (Gemini 2.5, Claude extended thinking)
- **Free image gen** (new): say "generate an image of X" — uses Gemini image generation at $0
- **Multi-model support**: Gemini 2.5 Pro/Flash, Claude Opus/Sonnet/Haiku, Ollama local models
- WebContainer live HMR preview + interactive xterm.js terminal
- Agent can execute OS commands and install npm/pip dependencies via `install_deps` tool
- Penpot design canvas embed
- Sandboxed plugin system with two built-in plugins (Code Stats, TODO Finder)
- Git source control panel, diff viewer, command palette, file tree with DnD

## User preferences

- Electron desktop build support must be maintained alongside the web app
- Multi-model support: Gemini 2.5 Pro/Flash, Claude, Ollama local models all supported
- Planning/Agent mode switch replaces `/build` prefix — keep this UX

## Gotchas

- WebContainers require Chrome/Edge (COEP/COOP headers must be present)
- `npm install --omit=optional` skips Electron if desktop build is not needed
- Electron `main.js` dev URL must match the Next.js port (currently 5000)
- WebContainers won't work in Firefox or Safari
- Ollama models require Ollama running locally at configured endpoint (default: localhost:11434)
- Claude models require `anthropic` API key in Settings → Agents
- Settings persist as `astrolaunch.settings.v3` in localStorage (was v2 — users may need to re-enter API keys)
- `install_deps` tool only allows install commands (npm install, pip install, etc.) — safety guard

## Pointers

- Next.js docs: https://nextjs.org/docs
- WebContainer API: https://webcontainers.io/
- Penpot: https://penpot.app/
- Anime.js v4: https://animejs.com/
