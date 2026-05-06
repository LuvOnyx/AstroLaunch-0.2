// Core domain types for AstroLaunch

export interface FileNode {
  id: string
  name: string
  path: string
  type: "file" | "folder"
  parentId: string | null
  children?: string[]      // ordered child ids (folders only)
  content?: string         // files only
  language?: string
  size?: number
  modified?: number
  /** Set when the file was modified by an agent (for diff highlighting). 1=touched, 0/undefined=clean. Stored as number so Dexie can index it. */
  agentTouched?: 0 | 1
  /** Last-known content from disk — used to compute live diffs. */
  baseline?: string
}

export interface AgentChat {
  id: string
  name: string
  agentId: string          // which agent persona
  createdAt: number
  updatedAt: number
  pinned?: 0 | 1
  /** 1 = archived, 0/undefined = active. Stored as number so Dexie can index it. */
  archived?: 0 | 1
  /** Aggregated cost across this chat (USD, estimate). */
  totalCostUsd?: number
  /** Aggregated tokens across this chat. */
  totalTokens?: number
}

export type AgentMessageRole = "user" | "assistant" | "system" | "tool"

export interface AgentMessage {
  id: string
  chatId: string
  role: AgentMessageRole
  content: string
  toolCalls?: ToolCall[]
  taskId?: string
  createdAt: number
  /** When tools wrote/edited files, capture diffs for in-line review. */
  toolDiffs?: ToolDiff[]
  /** Token + cost accounting per message (assistant messages). */
  usage?: TokenUsage
  /** Persona id (architect / builder / reviewer / etc.) when role=assistant. */
  personaId?: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
  status: "pending" | "running" | "success" | "error"
  /** Number of automatic retries spent on this call. */
  retries?: number
  durationMs?: number
}

export interface ToolDiff {
  /** Tool that produced the diff (write_file, delete_file, etc.). */
  tool: string
  path: string
  /** "create" | "update" | "delete" */
  kind: "create" | "update" | "delete"
  /** Full before / after content for unified-diff rendering. */
  before?: string
  after?: string
  /** Pre-computed unified diff for cheap rendering. */
  unified?: string
  /** Cumulative line counts for stats. */
  added?: number
  removed?: number
}

export interface TokenUsage {
  input: number
  output: number
  /** Total billable tokens (input + output, possibly +cached). */
  total: number
  /** Estimated USD cost from the running model's price table. */
  costUsd: number
  /** Model that produced these tokens. */
  model: string
}

/** A single step in an agent plan with the critical is_done flag. */
export interface AgentTask {
  id: string
  chatId: string
  parentTaskId?: string
  title: string
  description: string
  status: "pending" | "in_progress" | "blocked" | "completed" | "failed"
  is_done: boolean         // ← intelligent done flag
  doneCriteria: string     // verifiable criteria
  evidence?: string        // proof captured when marking done
  createdAt: number
  updatedAt: number
  iterations: number
  maxIterations: number
  artifacts?: string[]     // file paths produced
  /** Tools actually invoked during the task. */
  toolHistory?: { name: string; ok: boolean; ts: number }[]
  /** Aggregated retries across all tool calls. */
  retries?: number
}

export interface AgentPersona {
  id: string
  name: string
  emoji: string
  description: string
  systemPrompt: string
  defaultModel: string
  color: string
}

export interface ProjectMeta {
  id: string
  name: string
  rootPath: string         // virtual root in storage
  createdAt: number
  framework?: "next" | "vite" | "react" | "node" | "static"
  hasGit: boolean
}

/* ---------- v0.2 additions ---------- */

/** A user-installed plugin manifest persisted in IndexedDB. */
export interface PluginRecord {
  id: string
  name: string
  version: string
  description: string
  author?: string
  /** Where the plugin is hosted. AstroLaunch loads it into a sandboxed iframe. */
  entry: string            // https URL or "data:text/html;base64,..."
  /** Permissions requested in the manifest. */
  permissions: PluginPermission[]
  /** Surfaces the plugin contributes to. */
  contributes: PluginContribution[]
  enabled: boolean
  installedAt: number
  /** Custom settings the plugin can persist via the bridge. */
  storage?: Record<string, unknown>
  /** Local plugin source (when installed from a manifest+code blob). */
  source?: { manifest: string; code: string }
}

export type PluginPermission =
  | "read_files"
  | "write_files"
  | "run_commands"
  | "open_dialogs"
  | "agent_calls"
  | "preview_url"
  | "settings"

export interface PluginContribution {
  /** Where the plugin shows up. */
  surface: "panel" | "command" | "statusbar" | "toolbar" | "editor_action"
  /** Human-friendly title in the surface. */
  title: string
  /** Icon (Iconify name or our local IconKey). */
  icon?: string
  /** Optional command id for command-palette contributions. */
  commandId?: string
  /** Hash of html/route to mount when activated. */
  view?: string
}

export interface PluginEvent {
  type: string
  payload?: unknown
}

/** Saved terminal session metadata (shells live in WebContainer). */
export interface TerminalSession {
  id: string
  title: string
  cwd: string
  createdAt: number
  /** Persisted scrollback for restore. */
  buffer?: string
}

/** Aggregated cost / usage row, used by the agent stats panel. */
export interface UsageRow {
  id: string
  chatId: string
  taskId?: string
  model: string
  input: number
  output: number
  costUsd: number
  ts: number
}

export interface Astronaught {
  id: string
  name: string
  emoji: string
  description?: string
  createdAt: number
  updatedAt: number
  activeChatId?: string | null
  totalCostUsd?: number
  totalTokens?: number
}
