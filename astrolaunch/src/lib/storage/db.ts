"use client"
import Dexie, { Table } from "dexie"
import type {
  FileNode, AgentChat, AgentMessage, AgentTask, ProjectMeta, AgentPersona,
  PluginRecord, TerminalSession, UsageRow,
} from "@/types"

class AstroDB extends Dexie {
  files!: Table<FileNode, string>
  chats!: Table<AgentChat, string>
  messages!: Table<AgentMessage, string>
  tasks!: Table<AgentTask, string>
  projects!: Table<ProjectMeta, string>
  personas!: Table<AgentPersona, string>
  plugins!: Table<PluginRecord, string>
  terminals!: Table<TerminalSession, string>
  usage!: Table<UsageRow, string>

  constructor() {
    super("astrolaunch-db")
    // v1 schema (kept for migration)
    this.version(1).stores({
      files: "id, parentId, path, type",
      chats: "id, agentId, updatedAt, archived",
      messages: "id, chatId, createdAt, taskId",
      tasks: "id, chatId, parentTaskId, status, is_done, updatedAt",
      projects: "id, name, createdAt",
      personas: "id, name",
    })
    // v2 schema — add plugins, terminals, usage
    this.version(2).stores({
      files: "id, parentId, path, type, agentTouched",
      chats: "id, agentId, updatedAt, archived",
      messages: "id, chatId, createdAt, taskId, personaId",
      tasks: "id, chatId, parentTaskId, status, is_done, updatedAt",
      projects: "id, name, createdAt",
      personas: "id, name",
      plugins: "id, name, enabled, installedAt",
      terminals: "id, createdAt",
      usage: "id, chatId, taskId, model, ts",
    }).upgrade(async () => {
      // No-op data migration — new tables start empty.
    })
  }
}

export const db = typeof window !== "undefined" ? new AstroDB() : (null as unknown as AstroDB)
