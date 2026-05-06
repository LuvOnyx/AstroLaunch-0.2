/**
 * Provider price book (USD per 1K tokens). Best-effort numbers — agents use
 * these for soft cost caps; users can edit via the Agents settings tab.
 *
 * Anything missing falls back to Gemini Flash pricing.
 */
export interface PricePoint { input: number; output: number; provider: string }

export const PRICE_BOOK: Record<string, PricePoint> = {
  // Google Gemini
  "gemini-2.5-pro":     { input: 0.00125, output: 0.005,   provider: "gemini" },
  "gemini-2.5-flash":   { input: 0.000075, output: 0.0003, provider: "gemini" },
  // OpenAI (illustrative)
  "gpt-4o":             { input: 0.005,   output: 0.015,   provider: "openai" },
  "gpt-4o-mini":        { input: 0.00015, output: 0.0006,  provider: "openai" },
  // Anthropic
  "claude-3-5-sonnet":  { input: 0.003,   output: 0.015,   provider: "anthropic" },
  "claude-3-5-haiku":   { input: 0.00025, output: 0.00125, provider: "anthropic" },
}

export function priceFor(model: string): PricePoint {
  return PRICE_BOOK[model] ?? PRICE_BOOK["gemini-2.5-flash"]
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model)
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

/** Heuristic token estimate when the provider didn't return usage. */
export function approxTokens(text: string) {
  // ~4 chars per token for English code/text — good enough for cost guardrails.
  return Math.ceil(text.length / 4)
}
