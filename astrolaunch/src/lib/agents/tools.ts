/**
 * Agent tool registry. v2 additions:
 *   - retry policy (max retries, exponential backoff, hard timeout)
 *   - per-call diff capture (write_file / delete_file produce ToolDiff records)
 *   - WebContainer integration for run_command via window.alWebContainer
 *   - additional tools: search_files, apply_patch, http_fetch, mark_task_done
 */
import { db } from "@/lib/storage/db"
import { nanoid } from "nanoid"
import type { FileNode, ToolCall, ToolDiff } from "@/types"
import { diffLines } from "./diff"
import type { RetryPolicy } from "@/store/settings"

export interface ToolCallContext {
  retry: RetryPolicy
  /** Collected diffs for the current agent turn — tools push into this. */
  diffs?: ToolDiff[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>
  /** Permissions a plugin would need to invoke this tool indirectly. */
  permissions?: string[]
  run: (args: Record<string, unknown>, ctx: ToolCallContext) => Promise<unknown>
}

async function findByPath(path: string): Promise<FileNode | undefined> {
  const norm = path.startsWith("/") ? path : `/${path}`
  return await db.files.where("path").equals(norm).first()
}

async function ensureFolders(path: string): Promise<string | null> {
  const segs = path.replace(/^\//, "").split("/")
  segs.pop() // drop filename
  let parentId: string | null = null
  let cur = ""
  for (const seg of segs) {
    cur = `${cur}/${seg}`
    let node = await db.files.where("path").equals(cur).first()
    if (!node) {
      node = {
        id: nanoid(), name: seg, path: cur, type: "folder",
        parentId, modified: Date.now(),
      }
      await db.files.add(node)
    }
    parentId = node.id
  }
  return parentId
}

export const TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the full text content of a file at the given path.",
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
    description: "Create or overwrite a file at path with content. Captures a diff for review.",
    permissions: ["write_files"],
    parameters: {
      path: { type: "string", description: "Path", required: true },
      content: { type: "string", description: "File content", required: true },
    },
    run: async ({ path, content }, ctx) => {
      const p = String(path).startsWith("/") ? String(path) : `/${path}`
      const next = String(content)
      const existing = await findByPath(p)
      const now = Date.now()
      if (existing) {
        const before = existing.content ?? ""
        const d = diffLines(before, next)
        if (ctx.diffs) ctx.diffs.push({
          tool: "write_file", path: p, kind: "update",
          before, after: next, unified: d.unified, added: d.added, removed: d.removed,
        })
        await db.files.update(existing.id, {
          content: next, modified: now, size: next.length, agentTouched: 1, baseline: existing.baseline ?? before,
        })
        return { ok: true, updated: true, path: p, added: d.added, removed: d.removed }
      }
      const parentId = await ensureFolders(p)
      const id = nanoid()
      const name = p.split("/").pop() ?? p
      const d = diffLines("", next)
      if (ctx.diffs) ctx.diffs.push({
        tool: "write_file", path: p, kind: "create",
        before: "", after: next, unified: d.unified, added: d.added, removed: 0,
      })
      await db.files.add({
        id, name, path: p, type: "file", parentId,
        content: next, modified: now, size: next.length, agentTouched: 1, baseline: "",
      })
      return { ok: true, created: true, path: p, added: d.added }
    },
  },
  {
    name: "list_files",
    description: "List all files and folders, optionally under a prefix.",
    permissions: ["read_files"],
    parameters: { prefix: { type: "string", description: "Path prefix" } },
    run: async ({ prefix }) => {
      const all = await db.files.toArray()
      const filtered = prefix ? all.filter((f) => f.path.startsWith(String(prefix))) : all
      return filtered.map((f) => ({ path: f.path, type: f.type, size: f.size }))
    },
  },
  {
    name: "delete_file",
    description: "Delete a file by path.",
    permissions: ["write_files"],
    parameters: { path: { type: "string", description: "Path", required: true } },
    run: async ({ path }, ctx) => {
      const node = await findByPath(String(path))
      if (!node) return { error: "Not found" }
      const before = node.content ?? ""
      if (ctx.diffs) ctx.diffs.push({
        tool: "delete_file", path: node.path, kind: "delete",
        before, after: "", unified: `--- a${node.path}\n+++ /dev/null\n`,
        added: 0, removed: before.split("\n").length,
      })
      await db.files.delete(node.id)
      return { ok: true, path: node.path }
    },
  },
  {
    name: "search_files",
    description: "Search files by content. Returns matching paths with line numbers.",
    permissions: ["read_files"],
    parameters: {
      query: { type: "string", description: "Substring or /regex/ pattern", required: true },
      maxResults: { type: "number", description: "Max results to return" },
    },
    run: async ({ query, maxResults = 50 }) => {
      const all = await db.files.where("type").equals("file").toArray()
      const q = String(query)
      const re = q.startsWith("/") && q.lastIndexOf("/") > 0
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
  {
    name: "run_command",
    description: "Run a shell command inside the WebContainer. Returns stdout + exit code.",
    permissions: ["run_commands"],
    parameters: { command: { type: "string", description: "Command", required: true } },
    run: async ({ command }) => {
      if (typeof window === "undefined") return { error: "No window" }
      // @ts-expect-error - bridged from preview component
      const wc = window.alWebContainer
      if (!wc?.run) return { error: "WebContainer not booted yet. Press Run preview first." }
      return await wc.run(String(command))
    },
  },
  {
    name: "http_fetch",
    description: "Fetch a URL (GET) and return text body. Useful for pulling docs or examples.",
    permissions: ["agent_calls"],
    parameters: {
      url: { type: "string", description: "https URL", required: true },
      maxBytes: { type: "number", description: "Cap response size" },
    },
    run: async ({ url, maxBytes = 50_000 }) => {
      const u = String(url)
      if (!/^https?:\/\//.test(u)) return { error: "Only http(s) URLs allowed" }
      try {
        const res = await fetch(u, { method: "GET" })
        const text = (await res.text()).slice(0, Number(maxBytes))
        return { ok: res.ok, status: res.status, body: text }
      } catch (e) { return { error: String(e) } }
    },
  },
  {
    name: "mark_task_done",
    description:
      "Mark a task is_done:true with evidence. Reviewer agent should use this only after verifying doneCriteria.",
    parameters: {
      taskId: { type: "string", description: "Task id", required: true },
      evidence: { type: "string", description: "Concrete evidence", required: true },
    },
    run: async ({ taskId, evidence }) => {
      const t = await db.tasks.get(String(taskId))
      if (!t) return { error: "Task not found" }
      await db.tasks.update(t.id, {
        is_done: true,
        status: "completed",
        evidence: String(evidence),
        updatedAt: Date.now(),
      })
      return { ok: true, taskId: t.id }
    },
  },
]

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

/** Run a tool with retry/backoff/timeout policy. Returns the ToolCall record. */
export async function runToolWithPolicy(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<ToolCall> {
  const def = TOOL_MAP[name]
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
      call.result = result
      call.status = "success"
      call.durationMs = Date.now() - start
      return call
    } catch (err) {
      lastErr = err
      if (attempt < ctx.retry.maxRetries) {
        await new Promise((r) => setTimeout(r, ctx.retry.backoffMs * 2 ** attempt))
      }
    }
  }
  call.status = "error"
  call.result = { error: String(lastErr) }
  call.durationMs = Date.now() - start
  return call
}

export function toolsAsGeminiSchema() {
  return [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: "OBJECT",
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }])
          ),
          required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
        },
      })),
    },
  ]
}
