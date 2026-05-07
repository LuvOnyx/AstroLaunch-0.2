/**
 * Agent tool registry v4.
 *
 * Key changes from v3:
 *   - run_command / install_deps now call /api/exec (real server shell, not WebContainer)
 *   - run_playwright added — writes spec to /tmp, runs it, returns output
 *   - All shell-based tools work immediately without any browser prerequisite
 */
import { db } from "@/lib/storage/db"
import { nanoid } from "nanoid"
import type { FileNode, ToolCall, ToolDiff } from "@/types"
import { diffLines } from "./diff"
import type { RetryPolicy } from "@/store/settings"

export interface ToolCallContext {
  retry: RetryPolicy
  diffs?: ToolDiff[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>
  permissions?: string[]
  run: (args: Record<string, unknown>, ctx: ToolCallContext) => Promise<unknown>
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function findByPath(path: string): Promise<FileNode | undefined> {
  const norm = path.startsWith("/") ? path : `/${path}`
  return db.files.where("path").equals(norm).first()
}

async function ensureFolders(path: string): Promise<string | null> {
  const segs = path.replace(/^\//, "").split("/")
  segs.pop()
  let parentId: string | null = null
  let cur = ""
  for (const seg of segs) {
    cur = `${cur}/${seg}`
    let node = await db.files.where("path").equals(cur).first()
    if (!node) {
      node = { id: nanoid(), name: seg, path: cur, type: "folder", parentId, modified: Date.now() }
      await db.files.add(node)
    }
    parentId = node.id
  }
  return parentId
}

/**
 * Execute a shell command on the server via /api/exec.
 * Replaces the old WebContainer-based runInContainer().
 * Works immediately — no boot sequence, no browser restrictions.
 */
async function runOnServer(
  command: string,
  cwd?: string,
  timeoutMs = 60_000,
): Promise<{ code: number; output: string; error?: string }> {
  if (typeof window === "undefined") {
    // Server-side tool call (shouldn't happen normally)
    return { code: 1, output: "", error: "runOnServer called server-side" }
  }
  try {
    const res = await fetch("/api/exec", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ command, cwd, timeout: timeoutMs }),
    })
    if (!res.ok) return { code: 1, output: "", error: `HTTP ${res.status}` }
    return await res.json()
  } catch (e) {
    return { code: 1, output: "", error: String(e) }
  }
}

// ── tool definitions ──────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  // ── file system ────────────────────────────────────────────────────────────
  {
    name: "read_file",
    description: "Read the full text content of a file from the workspace virtual filesystem.",
    permissions: ["read_files"],
    parameters: { path: { type: "string", description: "Workspace-relative path", required: true } },
    run: async ({ path }) => {
      const node = await findByPath(String(path))
      if (!node) return { error: `File not found: ${path}` }
      return { path: node.path, content: node.content ?? "", size: node.size ?? 0 }
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file. Captures a diff. Always write COMPLETE file content.",
    permissions: ["write_files"],
    parameters: {
      path:    { type: "string", description: "Path",         required: true },
      content: { type: "string", description: "File content", required: true },
    },
    run: async ({ path, content }, ctx) => {
      const p    = String(path).startsWith("/") ? String(path) : `/${path}`
      const next = String(content)
      const existing = await findByPath(p)
      const now  = Date.now()
      if (existing) {
        const before = existing.content ?? ""
        const d = diffLines(before, next)
        if (ctx.diffs) ctx.diffs.push({ tool: "write_file", path: p, kind: "update", before, after: next, unified: d.unified, added: d.added, removed: d.removed })
        await db.files.update(existing.id, { content: next, modified: now, size: next.length, agentTouched: 1, baseline: existing.baseline ?? before })
        return { ok: true, updated: true, path: p, added: d.added, removed: d.removed }
      }
      const parentId = await ensureFolders(p)
      const id = nanoid()
      const name = p.split("/").pop() ?? p
      const d = diffLines("", next)
      if (ctx.diffs) ctx.diffs.push({ tool: "write_file", path: p, kind: "create", before: "", after: next, unified: d.unified, added: d.added, removed: 0 })
      await db.files.add({ id, name, path: p, type: "file", parentId, content: next, modified: now, size: next.length, agentTouched: 1, baseline: "" })
      return { ok: true, created: true, path: p, added: d.added }
    },
  },
  {
    name: "list_files",
    description: "List all files and folders in the workspace, optionally filtered by path prefix.",
    permissions: ["read_files"],
    parameters: { prefix: { type: "string", description: "Path prefix filter (optional)" } },
    run: async ({ prefix }) => {
      const all = await db.files.toArray()
      const filtered = prefix ? all.filter((f) => f.path.startsWith(String(prefix))) : all
      return filtered.map((f) => ({ path: f.path, type: f.type, size: f.size }))
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the workspace by path.",
    permissions: ["write_files"],
    parameters: { path: { type: "string", description: "Path", required: true } },
    run: async ({ path }, ctx) => {
      const node = await findByPath(String(path))
      if (!node) return { error: "Not found" }
      const before = node.content ?? ""
      if (ctx.diffs) ctx.diffs.push({ tool: "delete_file", path: node.path, kind: "delete", before, after: "", unified: `--- a${node.path}\n+++ /dev/null\n`, added: 0, removed: before.split("\n").length })
      await db.files.delete(node.id)
      return { ok: true, path: node.path }
    },
  },
  {
    name: "search_files",
    description: "Search workspace files by content substring or /regex/. Returns matching paths + line numbers.",
    permissions: ["read_files"],
    parameters: {
      query:      { type: "string", description: "Substring or /regex/ pattern", required: true },
      maxResults: { type: "number", description: "Max results (default 50)" },
    },
    run: async ({ query, maxResults = 50 }) => {
      const all = await db.files.where("type").equals("file").toArray()
      const q   = String(query)
      const re  = q.startsWith("/") && q.lastIndexOf("/") > 0
        ? new RegExp(q.slice(1, q.lastIndexOf("/")), q.slice(q.lastIndexOf("/") + 1))
        : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      const out: { path: string; line: number; preview: string }[] = []
      for (const f of all) {
        const lines = (f.content ?? "").split("\n")
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            out.push({ path: f.path, line: i + 1, preview: lines[i].slice(0, 200) })
            if (out.length >= Number(maxResults)) return { results: out }
          }
        }
      }
      return { results: out }
    },
  },

  // ── shell execution ─────────────────────────────────────────────────────────
  {
    name: "run_command",
    description:
      "Run a shell command on the server (real bash — not a container). " +
      "Use for: checking/building files, running scripts, verifying output, git operations. " +
      "Runs in the project's working directory. Returns stdout+stderr and exit code.",
    permissions: ["run_commands"],
    parameters: {
      command: { type: "string", description: "Shell command", required: true },
      cwd:     { type: "string", description: "Working directory override (optional)" },
    },
    run: async ({ command, cwd }) => {
      return runOnServer(String(command), cwd ? String(cwd) : undefined, 60_000)
    },
  },
  {
    name: "install_deps",
    description:
      "Install npm / pip / yarn packages on the server. " +
      "Accepts: 'npm install <pkg>', 'pip install <pkg>', 'yarn add <pkg>', 'pnpm add <pkg>'. " +
      "Waits up to 3 minutes.",
    permissions: ["run_commands"],
    parameters: {
      command: { type: "string", description: "Install command e.g. 'npm install framer-motion'", required: true },
    },
    run: async ({ command }) => {
      const cmd = String(command).trim()
      const allowed = /^(npm (install|i|add)|yarn (add|install)|pnpm (add|install)|pip install|pip3 install|bun add)\s+/i
      if (!allowed.test(cmd)) {
        return { error: "Only package install commands are allowed (npm install, pip install, etc.)" }
      }
      const result = await runOnServer(cmd, undefined, 180_000)
      return {
        ...result,
        note: result.code === 0 ? "Package installed successfully." : "Installation failed. Check output for details.",
      }
    },
  },

  // ── playwright ──────────────────────────────────────────────────────────────
  {
    name: "run_playwright",
    description:
      "Write and run a Playwright end-to-end test. " +
      "Provide `spec` with valid TypeScript test code (import from '@playwright/test'). " +
      "The test runs headlessly against the running dev server at http://localhost:5000. " +
      "Returns full test output including pass/fail status.",
    permissions: ["run_commands"],
    parameters: {
      spec:     { type: "string", description: "Full TypeScript test file content", required: true },
      filename: { type: "string", description: "Test filename e.g. 'login.spec.ts' (default: 'agent-test.spec.ts')" },
    },
    run: async ({ spec, filename = "agent-test.spec.ts" }) => {
      const fname  = String(filename).replace(/[^a-z0-9._-]/gi, "-")
      const fpath  = `/tmp/al-pw-${Date.now()}-${fname}`
      // Write the spec file then run it
      const writeCmd = `cat > ${fpath} << 'PLAYWRIGHT_EOF'\n${String(spec)}\nPLAYWRIGHT_EOF`
      const write    = await runOnServer(writeCmd, undefined, 10_000)
      if (write.code !== 0) return { ...write, error: `Failed to write spec: ${write.error}` }

      const runCmd = `PLAYWRIGHT_BASE_URL=http://localhost:5000 npx playwright test ${fpath} --reporter=list 2>&1`
      const result = await runOnServer(runCmd, undefined, 120_000)
      // Cleanup
      await runOnServer(`rm -f ${fpath}`, undefined, 5_000).catch(() => {})
      return result
    },
  },

  // ── network ─────────────────────────────────────────────────────────────────
  {
    name: "http_fetch",
    description: "Fetch a URL (GET) and return text body. Useful for pulling docs or checking APIs.",
    permissions: ["agent_calls"],
    parameters: {
      url:      { type: "string", description: "https URL", required: true },
      maxBytes: { type: "number", description: "Cap response size (default 50 000)" },
    },
    run: async ({ url, maxBytes = 50_000 }) => {
      const u = String(url)
      if (!/^https?:\/\//.test(u)) return { error: "Only http(s) URLs allowed" }
      try {
        const res  = await fetch(u)
        const text = (await res.text()).slice(0, Number(maxBytes))
        return { ok: res.ok, status: res.status, body: text }
      } catch (e) { return { error: String(e) } }
    },
  },

  // ── task management ─────────────────────────────────────────────────────────
  {
    name: "mark_task_done",
    description: "Mark a task is_done:true. Reviewer should call this only after verifying doneCriteria with concrete proof (min 30 chars).",
    parameters: {
      taskId:   { type: "string", description: "Task id",                          required: true },
      evidence: { type: "string", description: "Concrete evidence (min 30 chars)", required: true },
    },
    run: async ({ taskId, evidence }) => {
      const t = await db.tasks.get(String(taskId))
      if (!t) return { error: "Task not found" }
      const ev = String(evidence)
      if (ev.length < 30) return { error: "Evidence too vague. Provide concrete proof of completion." }
      await db.tasks.update(t.id, { is_done: true, status: "completed", evidence: ev, updatedAt: Date.now() })
      return { ok: true, taskId: t.id }
    },
  },
]

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export async function runToolWithPolicy(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<ToolCall> {
  const def  = TOOL_MAP[name]
  const call: ToolCall = { id: nanoid(), name, args, status: "running", retries: 0 }
  if (!def) {
    call.status = "error"
    call.result = { error: `Unknown tool: ${name}` }
    return call
  }
  const start = Date.now()
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= ctx.retry.maxRetries; attempt++) {
    call.retries = attempt
    try {
      const result = await Promise.race([
        def.run(args, ctx),
        new Promise((_, rej) => setTimeout(() => rej(new Error("tool_timeout")), ctx.retry.timeoutMs)),
      ])
      call.result    = result
      call.status    = "success"
      call.durationMs = Date.now() - start
      return call
    } catch (err) {
      lastErr = err
      if (attempt < ctx.retry.maxRetries)
        await new Promise((r) => setTimeout(r, ctx.retry.backoffMs * 2 ** attempt))
    }
  }
  call.status    = "error"
  call.result    = { error: String(lastErr) }
  call.durationMs = Date.now() - start
  return call
}

export function toolsAsGeminiSchema() {
  return [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name:        t.name,
        description: t.description,
        parameters:  {
          type:       "OBJECT",
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }])
          ),
          required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
        },
      })),
    },
  ]
}
