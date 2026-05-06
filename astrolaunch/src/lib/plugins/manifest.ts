/**
 * Plugin manifest schema (JSON, validated with Zod). Plugins are loaded into a
 * sandboxed iframe and communicate with AstroLaunch through postMessage.
 *
 * Example minimal manifest:
 * {
 *   "id": "todo-helper",
 *   "name": "Todo Helper",
 *   "version": "0.1.0",
 *   "entry": "https://example.com/plugin.html",
 *   "permissions": ["read_files", "write_files"],
 *   "contributes": [
 *     { "surface": "panel", "title": "Todo Helper", "icon": "mdi:check-circle" }
 *   ]
 * }
 */
import { z } from "zod"
import type { PluginPermission } from "@/types"

export const PluginPermissionSchema = z.enum([
  "read_files",
  "write_files",
  "run_commands",
  "open_dialogs",
  "agent_calls",
  "preview_url",
  "settings",
])

export const PluginContributionSchema = z.object({
  surface: z.enum(["panel", "command", "statusbar", "toolbar", "editor_action"]),
  title: z.string().min(1).max(80),
  icon: z.string().optional(),
  commandId: z.string().optional(),
  view: z.string().optional(),
})

export const PluginManifestSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-_.]*$/i, "lowercase id with hyphens"),
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(20),
  description: z.string().max(280).optional(),
  author: z.string().max(80).optional(),
  entry: z.string().min(1),
  permissions: z.array(PluginPermissionSchema).default([]),
  contributes: z.array(PluginContributionSchema).default([]),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>

/**
 * Build a self-contained data: URL from inline HTML so simple plugins can be
 * installed without hosting infra. The HTML is rendered inside the sandbox.
 */
export function inlineEntry(html: string) {
  const b64 = typeof window === "undefined"
    ? Buffer.from(html, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(html)))
  return `data:text/html;base64,${b64}`
}

/**
 * Permissions that are NOT granted by default — shown to user on install.
 */
export const SENSITIVE_PERMISSIONS: PluginPermission[] = [
  "write_files", "run_commands", "agent_calls", "settings",
]

export function describePermission(p: PluginPermission): string {
  switch (p) {
    case "read_files": return "Read your workspace files"
    case "write_files": return "Create or modify workspace files"
    case "run_commands": return "Run shell commands inside the WebContainer"
    case "open_dialogs": return "Show modal dialogs in AstroLaunch"
    case "agent_calls": return "Call agent endpoints (uses your API key)"
    case "preview_url": return "Read the live preview URL"
    case "settings": return "Read and write your settings"
  }
}
