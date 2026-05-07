"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AgentProvider = "gemini" | "openai" | "anthropic" | "openrouter" | "ollama"

export type SupportedModel =
  | "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-2.0-flash" | "gemini-2.0-flash-lite"
  | "claude-opus-4-5" | "claude-sonnet-4-5" | "claude-3-5-sonnet-20241022"
  | "claude-haiku-3-5" | "claude-3-5-haiku-20241022"
  | "ollama:llama3.2" | "ollama:llama3.1" | "ollama:deepseek-r1"
  | "ollama:codestral" | "ollama:qwen2.5-coder" | "ollama:mistral" | "ollama:phi4"
  | (string & Record<never, never>) // allow custom model strings

/** Legacy alias kept for backwards compatibility */
export type GeminiModel = SupportedModel

export interface ThemeColors {
  topbar: string
  sidebar: string
  panel: string
  canvas: string
  chat: string
  accent: string
}

export interface RetryPolicy {
  maxRetries: number
  backoffMs: number
  timeoutMs: number
}

export interface SettingsState {
  showStatusBar: boolean
  showMinimap: boolean
  autoSave: boolean
  autoSaveDelay: number
  showTerminal: boolean
  themeMode: "dark" | "light" | "system"
  fontFamily: string
  monoFontFamily: string
  fontSize: number
  uiDensity: "compact" | "comfortable" | "spacious"
  borderRadius: number
  colors: ThemeColors
  defaultProvider: AgentProvider
  defaultModel: SupportedModel
  /** Ollama server base URL */
  ollamaEndpoint: string
  apiKeys: Partial<Record<AgentProvider, string>>
  systemPrompt: string
  maxIterations: number
  enablePlanner: boolean
  streamAgent: boolean
  showToolDiffs: boolean
  /** Show agent reasoning/thinking blocks in chat */
  showThinking: boolean
  /** Delay (ms) between orchestrator iterations — prevents rate limiting */
  iterationDelayMs: number
  retry: RetryPolicy
  costCapUsd: number
  rainbowBrackets: boolean
  wordWrap: boolean
  tabSize: number
  aiInlineEdit: boolean
  pluginsEnabled: boolean
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
  defaultModel: "gemini-2.5-pro" as SupportedModel,
  ollamaEndpoint: "http://localhost:11434",
  apiKeys: {} as Partial<Record<AgentProvider, string>>,
  systemPrompt:
    "You are an elite full-stack engineer agent inside the AstroLaunch IDE. Plan in small, verifiable steps. Mark each step is_done:true only after concrete output exists.",
  maxIterations: 12,
  enablePlanner: true,
  streamAgent: true,
  showToolDiffs: true,
  showThinking: true,
  iterationDelayMs: 300,
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
    { name: "astrolaunch.settings.v3" }
  )
)

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
  const mode = s.themeMode === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : s.themeMode
  r.classList.toggle("dark", mode === "dark")
  r.style.setProperty("--al-density", s.uiDensity === "compact" ? "0.85" : s.uiDensity === "spacious" ? "1.15" : "1")
}
