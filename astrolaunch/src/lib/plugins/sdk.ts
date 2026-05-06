/**
 * AstroLaunch Plugin SDK — drop this into your plugin's HTML to get a typed
 * client for calling the host. The SDK is framework-agnostic — works in vanilla
 * JS, React, Vue, Svelte, etc.
 *
 * Usage inside the plugin iframe:
 *   const al = createAstroClient()
 *   const files = await al.files.list("/src")
 *   await al.files.write("/notes.md", "# Hello")
 *   al.on("files.changed", (p) => console.log(p))
 */

export interface AstroClient {
  files: {
    list: (prefix?: string) => Promise<{ path: string; type: string; size?: number }[]>
    read: (path: string) => Promise<{ path: string; content: string }>
    write: (path: string, content: string) => Promise<unknown>
    delete: (path: string) => Promise<unknown>
  }
  commands: {
    run: (command: string) => Promise<{ code: number; output: string }>
  }
  agent: {
    chat: (messages: { role: string; content: string }[], opts?: { model?: string; systemPrompt?: string }) => Promise<{ ok: boolean; status: number; body: string }>
  }
  ui: {
    toast: (message: string, variant?: "default" | "success" | "error" | "warning") => Promise<unknown>
    dialog: (message: string) => Promise<{ ok: boolean }>
  }
  settings: {
    get: <T = unknown>(key?: string) => Promise<T>
    set: (key: string, value: unknown) => Promise<unknown>
  }
  preview: {
    url: () => Promise<{ url: string | null }>
  }
  storage: {
    get: <T = unknown>() => Promise<T>
    set: (patch: Record<string, unknown>) => Promise<unknown>
  }
  /** Subscribe to host events (e.g. "files.changed", "preview.ready"). */
  on: (event: string, fn: (payload: unknown) => void) => () => void
  /** Low-level escape hatch. */
  request: (action: string, payload?: unknown) => Promise<unknown>
}

/**
 * Inline source for the SDK — used by plugins that ship as a single HTML blob.
 * Importing this file from the host bundle gives plugin authors a copy-pasteable
 * `<script>` snippet via `ASTRO_SDK_SRC`.
 */
export const ASTRO_SDK_SRC = `
(function(global){
  function createAstroClient() {
    const pending = new Map();
    const events = new Map();
    let counter = 0;
    window.addEventListener("message", (e) => {
      const m = e.data || {};
      if (m.type === "response" && m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.ok ? resolve(m.result) : reject(new Error(m.error || "Plugin call failed"));
      } else if (m.type === "event" && m.event) {
        const set = events.get(m.event);
        if (set) set.forEach(fn => { try { fn(m.payload); } catch(_) {} });
      }
    });
    function request(action, payload) {
      return new Promise((resolve, reject) => {
        const id = "req-" + (++counter) + "-" + Math.random().toString(36).slice(2,7);
        pending.set(id, { resolve, reject });
        window.parent.postMessage({ id, type: "request", action, payload }, "*");
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error("Plugin request timeout")); }
        }, 30000);
      });
    }
    function on(event, fn) {
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(fn);
      return () => events.get(event).delete(fn);
    }
    return {
      files: {
        list: (prefix) => request("files.list", { prefix }),
        read: (path) => request("files.read", { path }),
        write: (path, content) => request("files.write", { path, content }),
        delete: (path) => request("files.delete", { path }),
      },
      commands: { run: (command) => request("commands.run", { command }) },
      agent: { chat: (messages, opts) => request("agent.chat", { messages, ...(opts||{}) }) },
      ui: {
        toast: (message, variant) => request("ui.toast", { message, variant: variant||"default" }),
        dialog: (message) => request("ui.dialog", { message }),
      },
      settings: {
        get: (key) => request("settings.get", { key }),
        set: (key, value) => request("settings.set", { key, value }),
      },
      preview: { url: () => request("preview.url") },
      storage: {
        get: () => request("plugin.storage.get"),
        set: (patch) => request("plugin.storage.set", patch),
      },
      on,
      request,
    };
  }
  global.createAstroClient = createAstroClient;
})(typeof window !== "undefined" ? window : this);
`

/** Build a starter HTML scaffold for inline plugins. */
export function buildPluginScaffold(opts: { title: string; body?: string; script?: string }) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: dark; --fg: #e4e4e7; --bg: #0c0c10; --muted: #71717a; --accent: #a78bfa; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; }
  button { background: var(--accent); color: #0c0c10; border: 0; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  pre { background: #1a1a22; padding: 8px; border-radius: 6px; overflow: auto; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  .muted { color: var(--muted); }
</style>
</head><body>
${opts.body ?? `<h1>${escapeHtml(opts.title)}</h1><p class="muted">Hello from a sandboxed plugin ⌁</p>`}
<script>${ASTRO_SDK_SRC}</script>
<script>
const al = createAstroClient();
${opts.script ?? `
al.ui.toast("Plugin loaded ✨", "success");
`}
</script>
</body></html>`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

/** Sample plugins shipped with AstroLaunch — demonstrate the SDK surface. */
export const SAMPLE_PLUGINS = [
  {
    manifest: {
      id: "code-stats",
      name: "Code Stats",
      version: "0.1.0",
      description: "Counts files and lines across the workspace.",
      author: "AstroLaunch",
      entry: "",
      permissions: ["read_files", "open_dialogs"],
      contributes: [{ surface: "panel", title: "Code Stats", icon: "mdi:chart-bar" }],
    },
    code: `
const list = await al.files.list();
const files = list.filter(f => f.type === "file");
let totalLines = 0;
const byExt = {};
for (const f of files) {
  const { content } = await al.files.read(f.path);
  const lines = (content || "").split("\\n").length;
  totalLines += lines;
  const ext = f.path.split(".").pop() || "?";
  byExt[ext] = (byExt[ext] || 0) + lines;
}
const html = "<h1>📊 Workspace stats</h1>" +
  "<p>Files: <b>" + files.length + "</b></p>" +
  "<p>Total lines: <b>" + totalLines + "</b></p>" +
  "<pre>" + Object.entries(byExt).sort((a,b)=>b[1]-a[1]).map(([k,v]) => k.padEnd(8)+v).join("\\n") + "</pre>";
document.body.innerHTML = html;
`,
  },
  {
    manifest: {
      id: "todo-finder",
      name: "TODO Finder",
      version: "0.1.0",
      description: "Lists TODO/FIXME comments across the workspace.",
      author: "AstroLaunch",
      entry: "",
      permissions: ["read_files"],
      contributes: [{ surface: "panel", title: "TODOs", icon: "mdi:format-list-checks" }],
    },
    code: `
const list = await al.files.list();
const todos = [];
for (const f of list.filter(x=>x.type==="file")) {
  const { content } = await al.files.read(f.path);
  (content||"").split("\\n").forEach((line, i) => {
    const m = line.match(/(TODO|FIXME|HACK)[:\\s].+/);
    if (m) todos.push({ path: f.path, line: i+1, text: m[0].trim() });
  });
}
document.body.innerHTML = "<h1>📝 TODOs (" + todos.length + ")</h1>" +
  todos.slice(0,200).map(t => "<div><b>"+t.path+":"+t.line+"</b> <span class='muted'>"+t.text.replace(/</g,"&lt;")+"</span></div>").join("");
`,
  },
] as const
