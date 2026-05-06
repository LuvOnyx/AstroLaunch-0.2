# AstroLaunch — Setup Instructions (v0.2)

## 1. Prerequisites
- **Node.js 20+** (required by `@webcontainer/api` and Next 15)
- **npm 10+** (or pnpm / bun — adjust commands)
- A modern Chromium browser (WebContainers requires Chrome / Edge / Brave)

## 2. Install
```bash
unzip astrolaunch-v2.zip
cd astrolaunch
npm install
```

If the install fails on `electron`, you can skip the desktop build:
```bash
npm install --omit=optional
```

## 3. Run as a web app
```bash
npm run dev
# open http://localhost:3000
```

The dev server automatically sets the COEP/COOP headers required by
WebContainers.

## 4. Run as an Electron desktop app
```bash
npm run electron:dev
```

## 5. Production builds
```bash
npm run build              # static + server bundle
npm run start              # production web server
npm run electron:build     # cross-platform installers in /release
```

## 6. Add your Gemini API key
1. Launch AstroLaunch.
2. Press **⌘,** or click the **gear** icon (top-right).
3. Open the **Agents** tab.
4. Paste your Gemini key (`AIza…`) into the "Google Gemini" field.
5. Defaults: Gemini 2.5 Pro — switch to Flash for faster, cheaper iterations.
6. Tune the **retry policy** and **cost cap** to match your workflow.

## 7. Connect Penpot (design canvas)
1. Switch the topbar mode to **Canvas** or **Split**.
2. Paste your Penpot **base URL** (default: `https://design.penpot.app`) and the
   **file ID** from your Penpot URL.
3. For full embed support (no CSP issues), self-host Penpot.

## 8. Connect GitHub (push from the Source Control panel)
1. Open the **Source Control** tab in the activity rail.
2. Paste your repo HTTPS URL and a GitHub PAT (only stored in your browser).
3. Commit messages stage all changed files; **Push** validates the token
   against GitHub and sends the commit.

## 9. Run a multi-agent build
In the Floating Agent Chat (top-right), type:
```
/build a Next.js todo app with shadcn/ui and Tailwind
```
Watch the **Tasks** tab — each task carries a `doneCriteria`, `retries`, and
`toolHistory` chips. Only flips `is_done` when the Reviewer agent verifies
concrete evidence. The cost meter at the top of the chat tracks USD spend
against your cap.

## 10. Use the integrated terminal
- Press **⌘`** (Ctrl+\` on Linux/Windows) or click the terminal icon in the
  topbar.
- The terminal spawns inside the WebContainer; you can run `npm install`,
  `node`, `git`, etc.
- Multiple tabs supported; scrollback persists across reloads.

## 11. Install or write a plugin
1. Open the **Plugins** activity rail tab.
2. Click **Install** to open the installer.
3. Edit the manifest JSON and the plugin code (the SDK is auto-injected).
4. Confirm the requested permissions.
5. Click **Open** to run the plugin in a sandboxed iframe.

See [PLUGINS.md](./PLUGINS.md) for full authoring docs.

## 12. AI inline edit
1. Open any file.
2. Select code (or skip selection to target the whole file).
3. Press **⌘I** (Ctrl+I on Linux/Windows).
4. Describe the transformation. AstroLaunch streams the rewrite and applies
   it as a single edit.

## 13. Export / import workspace
- Settings → About → **Export workspace JSON** dumps every file, chat, task,
  and plugin to a JSON file.
- **Import workspace JSON** merges a previously exported file back in.

## 14. Troubleshooting
- **WebContainers won't boot** → confirm you're on Chrome/Edge and the page was
  served with COEP/COOP headers. Hard-reload.
- **Terminal shows blank** → it boots after WebContainer is ready (~2s).
  Click into the terminal to focus.
- **Penpot iframe blank** → some Penpot deployments block embedding via CSP.
  Self-host or run AstroLaunch as a Penpot plugin.
- **Gemini errors** → verify your key has access to `gemini-2.5-pro` and
  `gemini-2.5-flash`.
- **Cost cap reached** → bump the slider in Settings → Agents → Cost guardrails.
- **Plugin can't read files** → check that the plugin's manifest includes the
  required permission (e.g., `read_files`).
