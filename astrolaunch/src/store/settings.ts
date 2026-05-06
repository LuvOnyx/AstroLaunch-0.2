"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AgentProvider = "gemini" | "openai" | "anthropic" | "openrouter"
export type GeminiModel = "gemini-2.5-pro" | "gemini-2.5-flash"

export interface ThemeColors {
  topbar: string   // HSL components: "240 6% 10%"
  sidebar: string
  panel: string
  canvas: string
  chat: string
  accent: string
}

export interface RetryPolicy {
  /** Max automatic retries on a tool call before bubbling the error to the agent. */
  maxRetries: number
  /** Backoff base in ms (exponential: base * 2^attempt). */
  backoffMs: number
  /** Hard timeout per tool call. */
  timeoutMs: number
}

export interface SettingsState {
  // General
  showStatusBar: boolean
  showMinimap: boolean
  autoSave: boolean
  autoSaveDelay: number
  showTerminal: boolean
  // Appearance
  themeMode: "dark" | "light" | "system"
  fontFamily: string
  monoFontFamily: string
  fontSize: number
  uiDensity: "compact" | "comfortable" | "spacious"
  borderRadius: number
  colors: ThemeColors
  // Agents
  defaultProvider: AgentProvider
  defaultModel: GeminiModel
  apiKeys: Partial<Record<AgentProvider, string>>
  systemPrompt: string
  maxIterations: number
  enablePlanner: boolean
  /** Stream agent assistant tokens to the UI. */
  streamAgent: boolean
  /** Show inline tool diffs in messages. */
  showToolDiffs: boolean
  /** Retry policy for tool calls. */
  retry: RetryPolicy
  /** Hard cap on cost per /build run (USD). 0 = no limit. */
  costCapUsd: number
  // Editor
  rainbowBrackets: boolean
  wordWrap: boolean
  tabSize: number
  /** Enable AI inline edits (⌘I in editor). */
  aiInlineEdit: boolean
  // Plugins
  pluginsEnabled: boolean
  // Actions
  set: <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => void
  setColor: (k: keyof ThemeColors, v: string) => void
  setApiKey: (provider: AgentProvider, key: string) => void
  setRetry: (patch: Partial<RetryPolicy>) => void
  reset: () => void
}

const DEFAULT_COLORS: ThemeColors = {
  topbar: "240 6% 10%",
  sidebar: "240 6% 8%",
  panel: "240 6% 12%",
  canvas: "240 5% 15%",
  chat: "240 7% 11%",
  accent: "263 70% 60%",
}

const DEFAULTS = {
  showStatusBar: true,
  showMinimap: true,
  autoSave: true,
  autoSaveDelay: 800,
  showTerminal: false,
  themeMode: "dark" as const,
  fontFamily: "Inter",
  monoFontFamily: "JetBrains Mono",
  fontSize: 14,
  uiDensity: "comfortable" as const,
  borderRadius: 0.6,
  colors: DEFAULT_COLORS,
  defaultProvider: "gemini" as const,
  defaultModel: "gemini-2.5-pro" as const,
  apiKeys: {},
  systemPrompt:
    "You are an elite full-stack engineer agent inside the AstroLaunch IDE. Plan in small, verifiable steps. Mark each step is_done:true only after concrete output exists.",
  maxIterations: 12,
  enablePlanner: true,
  streamAgent: true,
  showToolDiffs: true,
  retry: { maxRetries: 2, backoffMs: 600, timeoutMs: 60_000 } as RetryPolicy,
  costCapUsd: 1.5,
  rainbowBrackets: true,
  wordWrap: false,
  tabSize: 2,
  aiInlineEdit: true,
  pluginsEnabled: true,
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (k, v) => set({ [k]: v } as Partial<SettingsState>),
      setColor: (k, v) => set((s) => ({ colors: { ...s.colors, [k]: v } })),
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setRetry: (patch) => set((s) => ({ retry: { ...s.retry, ...patch } })),
      reset: () => set(DEFAULTS),
    }),
    { name: "astrolaunch.settings.v2" }
  )
)

/** Apply CSS variables from settings to <html> */
export function applySettingsToDOM(s: SettingsState) {
  if (typeof document === "undefined") return
  const r = document.documentElement
  r.style.setProperty("--al-topbar", s.colors.topbar)
  r.style.setProperty("--al-sidebar", s.colors.sidebar)
  r.style.setProperty("--al-panel", s.colors.panel)
  r.style.setProperty("--al-canvas", s.colors.canvas)
  r.style.setProperty("--al-chat", s.colors.chat)
  r.style.setProperty("--al-accent", s.colors.accent)
  r.style.setProperty("--radius", `${s.borderRadius}rem`)
  r.style.setProperty("--font-sans", `"${s.fontFamily}"`)
  r.style.setProperty("--font-mono", `"${s.monoFontFamily}"`)
  r.style.fontSize = `${s.fontSize}px`
  // Theme mode w/ "system" support
  const mode = s.themeMode === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : s.themeMode
  r.classList.toggle("dark", mode === "dark")
  // UI density → CSS variable for component padding
  r.style.setProperty("--al-density", s.uiDensity === "compact" ? "0.85" : s.uiDensity === "spacious" ? "1.15" : "1")
}
