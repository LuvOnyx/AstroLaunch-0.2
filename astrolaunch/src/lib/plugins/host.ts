"use client"
/**
 * Plugin host runtime — receives postMessage requests from sandboxed iframes
 * and dispatches to AstroLaunch capabilities, gated by the plugin's granted
 * permissions.
 *
 * Wire protocol (host ⇆ guest):
 *   guest → host:  { id, type: "request", action: "<verb>", payload }
 *   host → guest:  { id, type: "response", ok: true|false, result|error }
 *   host → guest:  { type: "event", event: "<name>", payload }   (no id)
 *
 * Verbs implemented:
 *   files.list / files.read / files.write / files.delete
 *   commands.run        (run_commands)
 *   agent.chat          (agent_calls)
 *   ui.toast / ui.dialog (open_dialogs)
 *   settings.get / settings.set (settings)
 *   preview.url         (preview_url)
 */
import { db } from "@/lib/storage/db"
import type { PluginRecord, PluginPermission } from "@/types"
import { TOOL_MAP, runToolWithPolicy } from "@/lib/agents/tools"
import { useSettings } from "@/store/settings"
import { toast } from "sonner"

interface IncomingMsg {
  id?: string
  type: "request"
  action: string
  payload?: unknown
}

export class PluginHost {
  private iframes = new Map<string, HTMLIFrameElement>()
  private records = new Map<string, PluginRecord>()
  private listener?: (e: MessageEvent) => void

  /** Register a plugin instance with its iframe so we can reply to its messages. */
  register(record: PluginRecord, iframe: HTMLIFrameElement) {
    this.iframes.set(record.id, iframe)
    this.records.set(record.id, record)
    this.ensureListener()
  }

  unregister(pluginId: string) {
    this.iframes.delete(pluginId)
    this.records.delete(pluginId)
    if (this.iframes.size === 0 && this.listener) {
      window.removeEventListener("message", this.listener)
      this.listener = undefined
    }
  }

  /** Broadcast an event (e.g. "files.changed") to all registered plugins. */
  broadcast(event: string, payload?: unknown) {
    for (const iframe of this.iframes.values()) {
      try {
        iframe.contentWindow?.postMessage({ type: "event", event, payload, source: "astrolaunch" }, "*")
      } catch {}
    }
  }

  private ensureListener() {
    if (this.listener) return
    this.listener = async (e: MessageEvent) => {
      const data = e.data as IncomingMsg | undefined
      if (!data || data.type !== "request" || !data.action) return
      const sourcePlugin = this.findPluginByWindow(e.source as Window | null)
      if (!sourcePlugin) return
      const reply = (ok: boolean, body: unknown) => {
        try {
          const win = (this.iframes.get(sourcePlugin.id))?.contentWindow
          win?.postMessage({
            id: data.id, type: "response", ok,
            ...(ok ? { result: body } : { error: String(body) }),
          }, "*")
        } catch {}
      }
      try {
        const result = await this.handle(sourcePlugin, data.action, data.payload)
        reply(true, result)
      } catch (err) {
        reply(false, err instanceof Error ? err.message : String(err))
      }
    }
    window.addEventListener("message", this.listener)
  }

  private findPluginByWindow(w: Window | null): PluginRecord | null {
    if (!w) return null
    for (const [id, frame] of this.iframes) {
      if (frame.contentWindow === w) return this.records.get(id) ?? null
    }
    return null
  }

  private requirePermission(rec: PluginRecord, perm: PluginPermission) {
    if (!rec.permissions.includes(perm)) {
      throw new Error(`Plugin "${rec.id}" missing permission: ${perm}`)
    }
  }

  private async handle(rec: PluginRecord, action: string, payload: unknown): Promise<unknown> {
    const p = (payload ?? {}) as Record<string, unknown>
    switch (action) {
      case "files.list": {
        this.requirePermission(rec, "read_files")
        const all = await db.files.toArray()
        const prefix = String(p.prefix ?? "")
        return all
          .filter((f) => !prefix || f.path.startsWith(prefix))
          .map((f) => ({ path: f.path, type: f.type, size: f.size }))
      }
      case "files.read": {
        this.requirePermission(rec, "read_files")
        const node = await db.files.where("path").equals(String(p.path)).first()
        if (!node) throw new Error("Not found")
        return { path: node.path, content: node.content ?? "" }
      }
      case "files.write": {
        this.requirePermission(rec, "write_files")
        const call = await runToolWithPolicy("write_file",
          { path: p.path, content: p.content },
          { retry: useSettings.getState().retry, diffs: [] })
        if (call.status !== "success") throw new Error(JSON.stringify(call.result))
        return call.result
      }
      case "files.delete": {
        this.requirePermission(rec, "write_files")
        const call = await runToolWithPolicy("delete_file",
          { path: p.path },
          { retry: useSettings.getState().retry, diffs: [] })
        if (call.status !== "success") throw new Error(JSON.stringify(call.result))
        return call.result
      }
      case "commands.run": {
        this.requirePermission(rec, "run_commands")
        const def = TOOL_MAP["run_command"]
        if (!def) throw new Error("Tool unavailable")
        return await def.run({ command: String(p.command) }, { retry: useSettings.getState().retry })
      }
      case "agent.chat": {
        this.requirePermission(rec, "agent_calls")
        const settings = useSettings.getState()
        const apiKey = settings.apiKeys.gemini
        if (!apiKey) throw new Error("No Gemini API key set")
        const res = await fetch("/api/agents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: p.messages, apiKey,
            model: p.model ?? settings.defaultModel,
            systemPrompt: p.systemPrompt ?? settings.systemPrompt,
          }),
        })
        // Plugins get the raw text body (events not parsed) — they can stream it themselves
        return { ok: res.ok, status: res.status, body: await res.text() }
      }
      case "ui.toast": {
        this.requirePermission(rec, "open_dialogs")
        const variant = String(p.variant ?? "default")
        const msg = String(p.message ?? "")
        if (variant === "error") toast.error(msg)
        else if (variant === "success") toast.success(msg)
        else if (variant === "warning") toast.warning(msg)
        else toast(msg)
        return { ok: true }
      }
      case "ui.dialog": {
        this.requirePermission(rec, "open_dialogs")
        const ok = window.confirm(String(p.message ?? ""))
        return { ok }
      }
      case "settings.get": {
        this.requirePermission(rec, "settings")
        const key = String(p.key ?? "")
        if (!key) return useSettings.getState()
        const all = useSettings.getState() as unknown as Record<string, unknown>
        return all[key]
      }
      case "settings.set": {
        this.requirePermission(rec, "settings")
        const setter = useSettings.getState().set as (k: string, v: unknown) => void
        setter(String(p.key), p.value)
        return { ok: true }
      }
      case "preview.url": {
        this.requirePermission(rec, "preview_url")
        // The preview component pushes the URL onto window.alPreviewUrl
        return { url: (window as unknown as { alPreviewUrl?: string }).alPreviewUrl ?? null }
      }
      case "plugin.storage.get": {
        const r = await db.plugins.get(rec.id)
        return r?.storage ?? {}
      }
      case "plugin.storage.set": {
        const r = await db.plugins.get(rec.id)
        if (!r) throw new Error("Not installed")
        await db.plugins.update(rec.id, { storage: { ...(r.storage ?? {}), ...(p as object) } })
        return { ok: true }
      }
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }
}

export const pluginHost = typeof window !== "undefined" ? new PluginHost() : (null as unknown as PluginHost)
