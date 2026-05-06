# AstroLaunch

Next-generation IDE + Design Workstation that runs as both a **Next.js web app** and an **Electron desktop app** (Windows/macOS). Combines a Monaco code editor, Penpot design canvas, WebContainer live preview, xterm.js terminal, multi-agent AI system (Gemini), and a sandboxed plugin SDK.

## Run & Operate

| Command | Purpose |
|---|---|
| `cd astrolaunch && npm run dev` | Start web app on port 5000 (Replit preview) |
| `cd astrolaunch && npm run build` | Production Next.js build |
| `cd astrolaunch && npm run electron:build` | Build Windows/macOS/Linux desktop installers → `/release` |
| `cd astrolaunch && npm run typecheck` | TypeScript check |

**Required env vars:** None at startup — Gemini API key is set in-app via Settings → Agents tab.

## Stack

- **Frontend/Web:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 3
- **Desktop:** Electron 33, electron-builder
- **Editor:** Monaco Editor
- **State:** Zustand + Jotai
- **Storage:** Dexie (IndexedDB)
- **AI:** Google Gemini (`@google/generative-ai`)
- **Terminal:** xterm.js inside WebContainer (`@webcontainer/api`)
- **Package manager:** npm 10, Node.js 20

## Where things live

- `astrolaunch/src/app/` — Next.js App Router (pages + API routes)
- `astrolaunch/src/components/` — UI components (editor, terminal, canvas, plugins, agent-chat)
- `astrolaunch/src/lib/` — Core logic (agents, webcontainer, plugins, storage)
- `astrolaunch/src/store/` — Zustand stores (settings, workspace)
- `astrolaunch/electron/` — Electron main + preload scripts
- `astrolaunch/next.config.mjs` — Next.js config (COEP/COOP headers for WebContainers)
- `astrolaunch/package.json` — Scripts and dependencies

## Architecture decisions

- COEP/COOP headers (`require-corp` / `same-origin`) are set in `next.config.mjs` and Electron's session — required for WebContainer API to boot
- Electron dev mode loads `http://localhost:5000` (the Next.js dev server)
- Electron is only for Windows/macOS distribution; the Replit preview uses the web app directly
- Dexie v2 schema persists files, chats, tasks, plugins, terminals, and usage in IndexedDB
- Plugin SDK uses sandboxed iframes + postMessage; permissions are validated via Zod manifest schema

## Product

- Monaco-based code editor with AI inline edit (⌘I)
- Multi-agent loop: Architect → Builder → Reviewer powered by Gemini
- WebContainer live HMR preview + integrated xterm.js terminal
- Penpot design canvas embed
- Sandboxed plugin system with two built-in plugins (Code Stats, TODO Finder)
- Git source control panel, diff viewer, command palette, file tree with DnD

## User preferences

- Electron desktop build support must be maintained alongside the web app

## Gotchas

- WebContainers require Chrome/Edge (COEP/COOP headers must be present)
- `npm install --omit=optional` skips Electron if desktop build is not needed
- Electron `main.js` dev URL must match the Next.js port (currently 5000)
- WebContainers won't work in Firefox or Safari

## Pointers

- Next.js docs: https://nextjs.org/docs
- WebContainer API: https://webcontainers.io/
- Penpot: https://penpot.app/
