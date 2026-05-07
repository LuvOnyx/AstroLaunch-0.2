/**
 * Provider price book (USD per 1K tokens).
 * Covers Gemini, Claude, Ollama (free), and image generation.
 */
export interface PricePoint { input: number; output: number; provider: string }

export const PRICE_BOOK: Record<string, PricePoint> = {
  // ── Google Gemini ─────────────────────────────────────────────────────────
  "gemini-2.5-pro":                           { input: 0.00125,  output: 0.005,    provider: "gemini" },
  "gemini-2.5-flash":                         { input: 0.000075, output: 0.0003,   provider: "gemini" },
  "gemini-2.0-flash":                         { input: 0.00010,  output: 0.0004,   provider: "gemini" },
  "gemini-2.0-flash-lite":                    { input: 0.000075, output: 0.0003,   provider: "gemini" },
  "gemini-2.0-flash-preview-image-generation":{ input: 0.0,      output: 0.0,      provider: "gemini" }, // free
  "gemini-1.5-flash":                         { input: 0.000075, output: 0.0003,   provider: "gemini" },
  // ── Anthropic Claude ─────────────────────────────────────────────────────
  "claude-opus-4-5":                          { input: 0.015,    output: 0.075,    provider: "anthropic" },
  "claude-sonnet-4-5":                        { input: 0.003,    output: 0.015,    provider: "anthropic" },
  "claude-3-5-sonnet-20241022":               { input: 0.003,    output: 0.015,    provider: "anthropic" },
  "claude-haiku-3-5":                         { input: 0.00025,  output: 0.00125,  provider: "anthropic" },
  "claude-3-5-haiku-20241022":                { input: 0.00025,  output: 0.00125,  provider: "anthropic" },
  // ── Ollama (local – free) ─────────────────────────────────────────────────
  "ollama:llama3.2":                          { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:llama3.1":                          { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:codestral":                         { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:deepseek-r1":                       { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:qwen2.5-coder":                     { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:mistral":                           { input: 0.0,      output: 0.0,      provider: "ollama" },
  "ollama:phi4":                              { input: 0.0,      output: 0.0,      provider: "ollama" },
}

export function priceFor(model: string): PricePoint {
  return PRICE_BOOK[model] ?? (
    model.startsWith("ollama:") ? { input: 0, output: 0, provider: "ollama" } :
    model.startsWith("claude")  ? { input: 0.003, output: 0.015, provider: "anthropic" } :
    PRICE_BOOK["gemini-2.5-flash"]
  )
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model)
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

/** Heuristic token estimate when the provider didn't return usage. */
export function approxTokens(text: string) {
  return Math.ceil(text.length / 4)
}

/** Check which provider a model belongs to */
export function modelProvider(model: string): "gemini" | "anthropic" | "ollama" {
  if (model.startsWith("claude")) return "anthropic"
  if (model.startsWith("ollama:")) return "ollama"
  return "gemini"
}

/** Get the model options for the given provider */
export const MODEL_OPTIONS = {
  gemini: [
    { value: "gemini-2.5-pro",   label: "Gemini 2.5 Pro ✦" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash ⚡" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  ],
  anthropic: [
    { value: "claude-opus-4-5",           label: "Claude Opus 4.5 ✦" },
    { value: "claude-sonnet-4-5",         label: "Claude Sonnet 4.5" },
    { value: "claude-3-5-sonnet-20241022",label: "Claude 3.5 Sonnet" },
    { value: "claude-haiku-3-5",          label: "Claude Haiku 3.5 ⚡" },
  ],
  ollama: [
    { value: "ollama:llama3.2",      label: "Llama 3.2 (local) 🆓" },
    { value: "ollama:llama3.1",      label: "Llama 3.1 (local) 🆓" },
    { value: "ollama:deepseek-r1",   label: "DeepSeek R1 (local) 🆓" },
    { value: "ollama:codestral",     label: "Codestral (local) 🆓" },
    { value: "ollama:qwen2.5-coder", label: "Qwen 2.5 Coder (local) 🆓" },
    { value: "ollama:mistral",       label: "Mistral (local) 🆓" },
    { value: "ollama:phi4",          label: "Phi-4 (local) 🆓" },
  ],
} as const
