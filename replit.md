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
- **Terminal:** xterm.js inside WebContainer (`@webcontainer/api`)
- **Package manager:** npm 10, Node.js 20

## Where things live

- `astrolaunch/src/app/` — Next.js App Router (pages + API routes)
- `astrolaunch/src/app/api/agents/` — chat, execute, plan, image API routes (multi-provider)
- `astrolaunch/src/components/agent-chat/` — FloatingAgentChat, ModeSwitch, ReasoningBlock, AttachmentBar, MessageView, AgentSidebar
- `astrolaunch/src/components/topbar/` — Topbar, MenuBar (full app menu bar)
- `astrolaunch/src/components/welcome/` — WelcomeModal (startup modal with templates)
- `astrolaunch/src/components/terminal/` — TerminalPanel (xterm + WebContainer jsh)
- `astrolaunch/src/lib/agents/` — orchestrator, tools, model-router, pricing, personas
- `astrolaunch/src/lib/templates/` — 5 project templates + applyTemplate()
- `astrolaunch/src/store/settings.ts` — all user settings incl. showWelcome, recentProjects
- `astrolaunch/src/store/workspace.ts` — workspace UI state incl. bottom panel state
- `astrolaunch/src/types/index.ts` — all domain types
- `astrolaunch/next.config.mjs` — COEP/COOP headers for WebContainers

## Architecture decisions

- **Multi-model routing:** `src/lib/agents/model-router.ts` — Gemini uses `@google/generative-ai`, Claude + Ollama use raw `fetch()`
- **Planning/Agent switch** in chat header — "Planning" triggers Architect→Builder→Reviewer loop, "Agent" is streaming chat
- **Gemini streaming fix:** parts loop fixed — collects all non-thought text from `parts[]` then yields one delta, falls back to `chunk.text()` if no parts
- **Agent delta fix:** `if (typeof obj.delta === "string")` (was falsy check — missed empty strings)
- **Menu action bus:** `dispatchMenuAction(action, payload)` custom window events; `useMenuAction(action, handler)` hook for subscribers
- **WelcomeModal:** shown on startup if `showWelcome` is true (settings store); also triggered via Help menu
- **Templates:** 5 built-in templates (React+Vite, Next.js 15, FiveM+UI, Express API, T3 Stack) — `applyTemplate()` clears DB and inserts all files
- **FileTree context menu:** right-click on any node for new/rename/copy/paste/delete/copy-path actions
- **Desktop file drop:** drag files from OS into file explorer — reads as text and imports to workspace
- COEP/COOP headers (`require-corp` / `same-origin`) set in `next.config.mjs` — required for WebContainer API
- Dexie v3 schema persists files, chats, messages, tasks, plugins, terminals, usage in IndexedDB

## Product

- Monaco code editor with AI inline edit (⌘I)
- Multi-agent loop: Architect → Builder → Reviewer powered by Gemini / Claude / Ollama
- **Menu bar** (new): macOS-style File/Edit/View/Run/Terminal/Templates/Help menus
- **Welcome modal** (new): startup screen with New Workspace, Open Project, Templates, Recent Projects
- **Templates system** (new): 5 built-in templates with full boilerplate files
- **FileTree v3** (new): right-click context menu, desktop drag-drop, copy/paste, keyboard shortcuts
- **Planning mode**: switch in chat header runs full agent loop
- **Agent mode**: streaming chat with auto-persona routing (Astronaught system)
- **File + image attachment** in chat: inject files as context, images as vision multimodal input
- **Reasoning dropdown**: click to reveal agent's thinking tokens (Gemini 2.5, Claude extended thinking)
- **Free image gen**: say "generate an image of X" — uses Gemini image generation at $0
- **Multi-model support**: Gemini 2.5 Pro/Flash, Claude Opus/Sonnet/Haiku, Ollama local models
- WebContainer live HMR preview + interactive xterm.js terminal
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
- Gemini streaming: parts loop must collect text per-chunk then yield once (avoid calling `chunk.text()` inside parts loop)
- `typeof obj.delta === "string"` must be used (not just `if (obj.delta)`) to catch empty string deltas

## Pointers

- Next.js docs: https://nextjs.org/docs
- WebContainer API: https://webcontainers.io/
- Penpot: https://penpot.app/
- Anime.js v4: https://animejs.com/
