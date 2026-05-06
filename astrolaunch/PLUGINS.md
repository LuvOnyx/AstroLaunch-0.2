# AstroLaunch Plugin Authoring Guide

AstroLaunch plugins are **single HTML documents** loaded into a sandboxed
iframe. They communicate with the host through `postMessage` using the
auto-injected `createAstroClient()` SDK.

This isolation model means:

- Plugins cannot read AstroLaunch's localStorage, cookies, or other plugins'
  data directly.
- Every privileged action (read/write files, run commands, call agents,
  change settings, open dialogs) requires an explicit permission.
- Permission grants are confirmed by the user at install time.

---

## 1. Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "Short summary",
  "author": "you@example.com",
  "entry": "https://example.com/plugin.html",
  "permissions": ["read_files", "open_dialogs"],
  "contributes": [
    { "surface": "panel", "title": "My Plugin", "icon": "mdi:puzzle" }
  ]
}
```

| Field | Notes |
|---|---|
| `id` | Lowercase + hyphens. Must be unique. |
| `entry` | https URL **or** auto-generated `data:text/html;base64,…` (when installed via the inline installer). |
| `permissions` | See below. |
| `contributes` | Where the plugin shows up. `panel` runs in the center pane. `command` adds a command-palette entry. |

Permissions:

| Permission | Grants |
|---|---|
| `read_files` | List + read workspace files |
| `write_files` | Create/update/delete workspace files |
| `run_commands` | Execute shell commands inside the WebContainer |
| `agent_calls` | Call `/api/agents/chat` (uses your API key) |
| `open_dialogs` | Show toasts and `confirm()` dialogs |
| `settings` | Read + modify AstroLaunch settings |
| `preview_url` | Read the live-preview URL |

Sensitive permissions (`write_files`, `run_commands`, `agent_calls`,
`settings`) trigger an explicit consent step before install.

---

## 2. SDK reference

The host injects `createAstroClient()` into every plugin scaffold. Calling it
returns a typed client.

```js
const al = createAstroClient()

// Files
const list = await al.files.list("/src")
const file = await al.files.read("/README.md")
await al.files.write("/notes.md", "# Hello")
await al.files.delete("/tmp/scratch.md")

// Commands (requires run_commands)
const { code, output } = await al.commands.run("ls -la")

// Agent (requires agent_calls)
const r = await al.agent.chat([{ role: "user", content: "Explain monads" }], {
  model: "gemini-2.5-flash",
})

// UI
await al.ui.toast("Done", "success")
const { ok } = await al.ui.dialog("Proceed?")

// Settings
const s = await al.settings.get()
await al.settings.set("themeMode", "light")

// Preview URL
const { url } = await al.preview.url()

// Plugin-private storage (always allowed)
await al.storage.set({ count: 1 })
const { count } = await al.storage.get()

// Events from the host
const off = al.on("files.changed", (info) => console.log(info))
```

All SDK methods return Promises and time out after 30s.

---

## 3. Authoring options

### Option A — Inline installer

The fastest way to ship something. Open **Plugins → Install**, paste a manifest
+ code body, and AstroLaunch will:

1. Validate the manifest with Zod.
2. Wrap your code in an HTML scaffold that auto-loads the SDK.
3. Embed the result as a `data:text/html;base64,…` entry.
4. Prompt you to grant the requested permissions.

The two sample plugins (**Code Stats** and **TODO Finder**) ship this way.

### Option B — Hosted plugin

Host an HTML document that includes the SDK script (read it out of
`Settings → Plugins` "Show SDK source", or copy the snippet below) and serve
the manifest alongside it. Then install by pasting the URL of the manifest.

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>My Plugin</title></head>
<body>
  <h1>Hello from a hosted plugin</h1>
  <script>/* paste ASTRO_SDK_SRC here */</script>
  <script>
    const al = createAstroClient()
    al.ui.toast("Hi 👋")
  </script>
</body></html>
```

---

## 4. Best practices

- **Be explicit about permissions.** Request the minimum set you need.
- **Never assume the user's preferred theme.** Use CSS variables (or read
  settings) so your plugin matches the surrounding chrome.
- **Avoid blocking the main thread.** The host enforces a 30s timeout per call.
- **Cache results** in `al.storage` rather than re-reading files every render.
- **Provide a fallback UI** if the user denies a permission later — the SDK
  call will reject with `"missing permission: …"`.

---

## 5. Debug tips

- The plugin runs in a `null`-origin iframe; you can use Chrome DevTools to
  inspect it like any other frame.
- `console.log` from the plugin appears in DevTools; the host doesn't proxy it.
- If your `data:` URL plugin fails to load, the manifest probably failed
  validation — check the installer error panel.
- Toasts are the easiest way to surface plugin state to the user.

---

## 6. Roadmap

- Plugin marketplace (signed manifests + auto-update channel)
- Editor surface contributions (status-bar items, custom code-actions)
- Plugin-to-plugin events (opt-in)
- Worker plugins (no UI, run in a Web Worker)
