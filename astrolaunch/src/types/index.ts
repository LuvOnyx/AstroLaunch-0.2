// Core domain types for AstroLaunch

export interface FileNode {
  id: string
  name: string
  path: string
  type: "file" | "folder"
  parentId: string | null
  children?: string[]
  content?: string
  language?: string
  size?: number
  modified?: number
  agentTouched?: 0 | 1
  baseline?: string
}

export interface AgentChat {
  id: string
  name: string
  agentId: string
  createdAt: number
  updatedAt: number
  pinned?: 0 | 1
  archived?: 0 | 1
  totalCostUsd?: number
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
  toolDiffs?: ToolDiff[]
  usage?: TokenUsage
  personaId?: string
  /** Agent reasoning/thinking tokens (shown in collapsible dropdown) */
  thinking?: string
  /** Attachments the user sent with this message */
  attachments?: Array<{ type: "file" | "image"; name: string }>
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
  status: "pending" | "running" | "success" | "error"
  retries?: number
  durationMs?: number
}

export interface ToolDiff {
  tool: string
  path: string
  kind: "create" | "update" | "delete"
  before?: string
  after?: string
  unified?: string
  added?: number
  removed?: number
}

export interface TokenUsage {
  input: number
  output: number
  total: number
  costUsd: number
  model: string
}

export interface AgentTask {
  id: string
  chatId: string
  parentTaskId?: string
  title: string
  description: string
  status: "pending" | "in_progress" | "blocked" | "completed" | "failed"
  is_done: boolean
  doneCriteria: string
  evidence?: string
  createdAt: number
  updatedAt: number
  iterations: number
  maxIterations: number
  artifacts?: string[]
  toolHistory?: { name: string; ok: boolean; ts: number }[]
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
  rootPath: string
  createdAt: number
  framework?: "next" | "vite" | "react" | "node" | "static"
  hasGit: boolean
}

export interface PluginRecord {
  id: string
  name: string
  version: string
  description: string
  author?: string
  entry: string
  permissions: PluginPermission[]
  contributes: PluginContribution[]
  enabled: boolean
  installedAt: number
  storage?: Record<string, unknown>
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
  surface: "panel" | "command" | "statusbar" | "toolbar" | "editor_action"
  title: string
  icon?: string
  commandId?: string
  view?: string
}

export interface PluginEvent {
  type: string
  payload?: unknown
}

export interface TerminalSession {
  id: string
  title: string
  cwd: string
  createdAt: number
  buffer?: string
}

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
