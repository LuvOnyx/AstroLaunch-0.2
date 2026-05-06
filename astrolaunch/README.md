# AstroLaunch ⌁ v0.2

> **The next-generation IDE + Design Workstation.**
> VS Code × Figma × Antigravity, unified into one beast.

AstroLaunch fuses an advanced code editor, a Penpot design canvas, a live HMR
preview powered by WebContainers, an integrated xterm.js terminal, a multi-agent
task system with intelligent `is_done` flags, and a sandboxed plugin SDK — into
a single, production-ready workstation.

It runs as both a **Next.js web app** and an **Electron desktop app**.

---

## What's new in 0.2

| Pillar | Upgrade |
|---|---|
| Agent loop | SSE-style streaming, retry policy with exponential backoff & timeout, per-tool diff capture, cost cap (USD), live Stats tab, abort button, persona switcher (Architect / Builder / Designer / Reviewer / Debugger / Refactorer) |
| Tools | New: `search_files`, `http_fetch`. Hardened: `write_file` produces ToolDiff records, automatic folder creation. Retry/timeout via runtime policy. |
| Terminal | xterm.js attached to a `jsh` process inside the WebContainer. Multiple sessions, persistent scrollback, resize-aware. |
| Plugin SDK | Sandboxed iframe + `postMessage` protocol. Manifest validated by Zod. Permission prompts before install. Two sample plugins ship out of the box: **Code Stats** and **TODO Finder**. |
| Editor | ⌘I AI inline edit — select code, describe a change, AstroLaunch rewrites the selection in place. Tab dirty + agent-touched indicators with one-click diff. |
| File tree | Above / inside / below drop zones with visual indicators, double-click rename, recursive delete, agent-edit pending dot. |
| Diff viewer | Side-by-side OR unified, accept / revert vs. baseline. |
| Bottom panel | Terminal · Problems · Output · Agent log — resizable, persisted. |
| Command palette | Categorized, fuzzy match, recent items, plugin commands, ⌘P quick file open. |
| Status bar | Lifetime cost, agent-edit count, click to toggle agent log. |
| Persistence | Dexie v2 schema with new tables: `plugins`, `terminals`, `usage`. Workspace import/export JSON. |

---

## Quick start

```bash
# 1. Install
cd astrolaunch
npm install

# 2. Run the web app (HMR on :3000)
npm run dev

# 3. Or run as an Electron desktop app
npm run electron:dev

# 4. Production builds
npm run build              # Next.js
npm run electron:build     # macOS / Windows / Linux installers
```

> **Note**: WebContainers require the page to be served with cross-origin
> isolation headers (`Cross-Origin-Embedder-Policy: require-corp` +
> `Cross-Origin-Opener-Policy: same-origin`). These are set automatically in
> `next.config.mjs` and the Electron main process.

---

## First-time setup

1. Open AstroLaunch.
2. Press **⌘,** (or click the gear icon) to open **Settings**.
3. Go to the **Agents** tab and paste your Gemini API key.
4. Adjust the **retry policy** and **cost cap** to your taste.
5. Switch to **Appearance** and pick a preset or fine-tune any surface.
6. Open a file from the Explorer or run `/build <your goal>` in the floating
   Agent Chat.

---

## The Agent Loop

When you type `/build <goal>` in the Agent Chat:

1. **Architect** decomposes the goal into 3–8 tasks with concrete `doneCriteria`.
2. **Builder** picks one task at a time, calls tools (`read_file`, `write_file`,
   `run_command`, `list_files`, `delete_file`, `search_files`, `http_fetch`,
   `mark_task_done`) inside the WebContainer.
3. Each tool call is wrapped by a **retry/backoff/timeout policy** (configurable).
4. **Reviewer** verifies whether the `doneCriteria` is satisfied and only then
   flips `is_done: true` with concrete evidence.
5. If a task hits its `maxIterations` cap or the **cost cap** is reached
   before being verified, it's marked `failed` to prevent runaway loops.

Watch the **Tasks tab** for live status (iterations, retries, evidence,
tool history) and the **Stats tab** for tokens, cost, and pass/fail counts.

Every assistant message carries an inline `usage` badge with input/output tokens
and estimated cost.

---

## Integrated terminal

Press **⌘`** or click the terminal icon in the topbar to spawn a real shell
inside the WebContainer. The terminal:

- Uses xterm.js with the AstroLaunch dark theme.
- Spawns `jsh` (the WebContainer's mini shell).
- Supports multiple tabs.
- Persists scrollback in IndexedDB.
- Surfaces the same output bus the Output panel listens to.

---

## Plugin SDK

Open the **Plugins** activity rail tab to install / enable / open plugins.

A plugin is a single HTML document loaded into a sandboxed iframe. Plugins
talk to AstroLaunch through `postMessage` using the `createAstroClient()` SDK
that's auto-injected into every plugin scaffold:

```js
const al = createAstroClient()
const files = await al.files.list("/src")
await al.files.write("/notes.md", "# Hello")
al.ui.toast("Done", "success")
al.on("files.changed", (info) => console.log(info))
```

Permissions:

- `read_files` · `write_files` · `run_commands`
- `agent_calls` · `open_dialogs` · `settings` · `preview_url`

Sensitive permissions (write/run/agent/settings) trigger an explicit consent
prompt before install.

See [PLUGINS.md](./PLUGINS.md) for the full authoring guide.

---

## Architecture overview

```
src/
├── app/
│   ├── api/agents/{plan,execute,chat}   # Gemini-powered agent endpoints (now with usage)
│   ├── api/git/                         # Git operations bridge
│   └── page.tsx                         # Root workstation shell
├── components/
│   ├── topbar/                          # Top menu + run button + cost badge
│   ├── layout/                          # LeftSidebar, CenterPanel, BottomPanel, CommandPalette
│   ├── file-tree/                       # FileTree with above/inside/below DnD
│   ├── git-panel/                       # Source control panel
│   ├── editor/                          # Monaco + ⌘I AI inline edit
│   ├── preview/                         # WebContainers live preview
│   ├── canvas/                          # Penpot canvas embed
│   ├── terminal/                        # xterm.js terminal panel
│   ├── plugins/                         # PluginPanel + PluginRunner
│   ├── diff/                            # Side-by-side / unified diff viewer
│   ├── agent-chat/                      # FloatingAgentChat + MessageView + AgentChatList
│   ├── settings/                        # Tabbed settings modal
│   └── ui/                              # shadcn primitives
├── lib/
│   ├── agents/                          # orchestrator, tools (with retry), diff, pricing, personas
│   ├── webcontainer/                    # boot + shell + bridge
│   ├── plugins/                         # manifest schema, host, SDK, sample plugins
│   ├── penpot/                          # PenpotBridge (postMessage IPC)
│   ├── storage/db.ts                    # Dexie v2 schema
│   ├── iconify/                         # On-demand JSON icon manifest
│   └── editor/lang.ts
├── store/                               # Zustand stores (settings, workspace) — persisted
└── types/                               # Shared TypeScript types
electron/                                # Desktop shell (main.js + preload.js)
```

---

## Keybindings (defaults)

| Combo | Action |
|---|---|
| ⌘K | Command palette |
| ⌘P | Quick file open |
| ⌘B | Toggle left sidebar |
| ⌘J | Toggle floating agent chat |
| ⌘\` | Toggle integrated terminal |
| ⌘I | AI inline edit (in editor) |
| ⌘, | Open settings |
| ⌘S | Save current file |
| ⌘⇧E / ⌘⇧F / ⌘⇧G / ⌘⇧A / ⌘⇧X | Explorer / Search / Git / Agents / Plugins |
| /build <goal> | Spawn the multi-agent loop |

---

## Roadmap (next)

- Real `isomorphic-git` integration with LightningFS in the browser
- Multi-cursor / live collaboration via Yjs
- Penpot Plugin (run AstroLaunch *inside* Penpot)
- Native Electron auto-update channel
- Plugin marketplace / signed manifests

---

## License

MIT — go build something extraordinary.
