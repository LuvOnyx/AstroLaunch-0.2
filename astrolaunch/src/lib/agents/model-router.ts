/**
 * Server-side multi-provider model router — v4
 * Supports: Google Gemini (2.5 Pro/Flash + 2.0), Anthropic Claude, Ollama (local)
 *
 * v4 fixes:
 *   - Gemini 2.5 Pro: never use responseMimeType with thinking (API rejects it)
 *   - Gemini 2.5 Pro: always configure thinkingConfig (it's a native thinking model)
 *   - Better JSON extraction when jsonMode requested without responseMimeType
 *   - Increased maxOutputTokens for plan/execute routes
 *   - Robust stream parsing: handles partial chunks, empty deltas
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import { modelProvider } from "./pricing"

export interface RouterMessage {
  role: "user" | "assistant" | "system"
  content: string | ContentPart[]
}

export interface ContentPart {
  type: "text" | "image_url"
  text?: string
  image_url?: { url: string }
}

export interface RouterChunk {
  delta?: string
  thinking?: string
  done?: boolean
  usage?: { input: number; output: number; model: string }
  error?: string
}

export interface RouterOptions {
  model: string
  messages: RouterMessage[]
  systemPrompt?: string
  apiKey?: string
  ollamaEndpoint?: string
  temperature?: number
  maxOutputTokens?: number
  jsonMode?: boolean
  thinking?: boolean
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

/** Gemini 2.5 Pro is a native thinking model — always needs thinkingConfig */
function isGeminiThinkingModel(model: string): boolean {
  return model.includes("gemini-2.5-pro") || model.includes("gemini-2.5-pro-preview")
}

/** For 2.5 Flash thinking is optional but supported */
function supportsThinking(model: string): boolean {
  return model.includes("2.5") || model.includes("2.0-flash-thinking")
}

async function* streamGemini(opts: RouterOptions): AsyncGenerator<RouterChunk> {
  const {
    model,
    messages,
    systemPrompt,
    apiKey,
    temperature = 0.7,
    jsonMode,
    thinking,
    maxOutputTokens = 16384,
  } = opts
  if (!apiKey) { yield { error: "Missing Gemini API key" }; return }

  const genAI = new GoogleGenerativeAI(apiKey)

  // Build generation config
  const genConfig: Record<string, unknown> = { temperature, maxOutputTokens }

  // CRITICAL: responseMimeType is INCOMPATIBLE with thinking on Gemini 2.5 Pro.
  // For thinking models, skip it and rely on prompt-based JSON instruction instead.
  const isThinkingModel = isGeminiThinkingModel(model)
  const thinkingEnabled = thinking || isThinkingModel
  if (jsonMode && !thinkingEnabled) {
    genConfig.responseMimeType = "application/json"
  }

  // Thinking config
  if (isThinkingModel) {
    // 2.5 Pro always thinks — give it a generous budget
    genConfig.thinkingConfig = { thinkingBudget: thinking ? 24576 : 4096 }
  } else if (thinking && supportsThinking(model)) {
    genConfig.thinkingConfig = { thinkingBudget: 8192 }
  }

  const modelConfig: Record<string, unknown> = {
    model,
    generationConfig: genConfig,
  }
  if (systemPrompt) modelConfig.systemInstruction = systemPrompt

  const m = genAI.getGenerativeModel(modelConfig as unknown as Parameters<typeof genAI.getGenerativeModel>[0])

  const userMessages = messages.filter((msg) => msg.role !== "system")
  const history = userMessages.slice(0, -1).map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: contentToParts(msg.content) as import("@google/generative-ai").Part[],
  }))
  const last = userMessages[userMessages.length - 1]
  const lastParts = last ? contentToParts(last.content) : [{ text: "" }]

  try {
    const chat = m.startChat({ history: history as import("@google/generative-ai").Content[] })
    const stream = await chat.sendMessageStream(lastParts as (string | import("@google/generative-ai").Part)[])

    let outputText = ""
    let thinkingText = ""

    for await (const chunk of stream.stream) {
      const raw = chunk as unknown as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string; thought?: boolean }>
          }
          finishReason?: string
        }>
      }

      const parts = raw.candidates?.[0]?.content?.parts ?? []

      if (parts.length === 0) {
        // Fallback: use the SDK helper (for models that don't return parts)
        try {
          const t = chunk.text()
          if (t) { outputText += t; yield { delta: t } }
        } catch {}
      } else {
        let chunkText = ""
        for (const part of parts) {
          if (part.thought === true && part.text) {
            thinkingText += part.text
            yield { thinking: part.text }
          } else if (part.text) {
            chunkText += part.text
          }
        }
        if (chunkText) { outputText += chunkText; yield { delta: chunkText } }
      }
    }

    const final = await stream.response
    const usageMeta = (final as unknown as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    }).usageMetadata
    const inputTokens = usageMeta?.promptTokenCount ?? Math.ceil(JSON.stringify(messages).length / 4)
    const outputTokens = (usageMeta?.candidatesTokenCount ?? 0) + (usageMeta?.thoughtsTokenCount ?? 0) || Math.ceil(outputText.length / 4)

    yield { done: true, usage: { input: inputTokens, output: outputTokens, model } }
    void thinkingText
  } catch (err) {
    const msg = String(err)
    // Provide helpful error messages for common 2.5 Pro issues
    if (msg.includes("responseMimeType") || msg.includes("INVALID_ARGUMENT")) {
      yield { error: `Gemini API error (${model}): ${msg}. Try switching to gemini-2.5-flash.` }
    } else if (msg.includes("API_KEY") || msg.includes("api_key") || msg.includes("403")) {
      yield { error: `Invalid Gemini API key. Check Settings → Agents.` }
    } else if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      yield { error: `Gemini rate limit / quota exceeded. Wait a moment and retry.` }
    } else {
      yield { error: `Gemini error: ${msg}` }
    }
  }
}

async function completeGemini(opts: RouterOptions): Promise<{ text: string; thinking?: string; usage?: RouterChunk["usage"] }> {
  let text = ""
  let thinking = ""
  let usage: RouterChunk["usage"] | undefined
  let errorMsg = ""
  for await (const chunk of streamGemini(opts)) {
    if (chunk.delta) text += chunk.delta
    if (chunk.thinking) thinking += chunk.thinking
    if (chunk.usage) usage = chunk.usage
    if (chunk.error) errorMsg = chunk.error
  }
  if (!text && errorMsg) return { text: "", thinking, usage }
  return { text, thinking: thinking || undefined, usage }
}

function contentToParts(content: string | ContentPart[]): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  if (typeof content === "string") return [{ text: content }]
  return content.map((p) => {
    if (p.type === "text") return { text: p.text ?? "" }
    if (p.type === "image_url" && p.image_url) {
      const url = p.image_url.url
      if (url.startsWith("data:")) {
        const [header, data] = url.split(",")
        const mimeType = header.replace("data:", "").replace(";base64", "")
        return { inlineData: { mimeType, data } }
      }
      return { text: `[image: ${url}]` }
    }
    return { text: "" }
  })
}

// ─── Anthropic Claude ────────────────────────────────────────────────────────

async function* streamClaude(opts: RouterOptions): AsyncGenerator<RouterChunk> {
  const { model, messages, systemPrompt, apiKey, temperature = 0.7, maxOutputTokens = 16384, thinking } = opts
  if (!apiKey) { yield { error: "Missing Anthropic API key" }; return }

  const system = systemPrompt ?? "You are a helpful assistant."
  const claudeMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role as "user" | "assistant",
    content: typeof m.content === "string" ? m.content : m.content.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text ?? "" }
      if (p.type === "image_url" && p.image_url?.url.startsWith("data:")) {
        const [header, data] = p.image_url.url.split(",")
        const media_type = header.replace("data:", "").replace(";base64", "")
        return { type: "image", source: { type: "base64", media_type, data } }
      }
      return { type: "text", text: "[image]" }
    }),
  }))

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxOutputTokens,
    temperature,
    system,
    messages: claudeMessages,
    stream: true,
  }

  if (thinking) {
    body.thinking = { type: "enabled", budget_tokens: 10000 }
    body.temperature = 1
  }

  let res: Response
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "interleaved-thinking-2025-05-14",
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    yield { error: `Anthropic connection failed: ${e}` }
    return
  }

  if (!res.ok) {
    const err = await res.text()
    yield { error: `Anthropic ${res.status}: ${err}` }
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { yield { error: "No response body" }; return }

  let inputTokens = 0
  let outputTokens = 0
  const decoder = new TextDecoder()
  let buf = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") continue
      try {
        const evt = JSON.parse(data)
        if (evt.type === "content_block_delta") {
          if (evt.delta?.type === "thinking_delta") {
            yield { thinking: evt.delta.thinking ?? "" }
          } else if (evt.delta?.type === "text_delta") {
            yield { delta: evt.delta.text ?? "" }
          }
        }
        if (evt.type === "message_delta" && evt.usage) outputTokens = evt.usage.output_tokens ?? 0
        if (evt.type === "message_start" && evt.message?.usage) inputTokens = evt.message.usage.input_tokens ?? 0
      } catch {}
    }
  }

  yield { done: true, usage: { input: inputTokens, output: outputTokens, model } }
}

async function completeClaude(opts: RouterOptions): Promise<{ text: string; thinking?: string; usage?: RouterChunk["usage"] }> {
  const { model, messages, systemPrompt, apiKey, temperature = 0.7, maxOutputTokens = 16384, jsonMode, thinking } = opts
  if (!apiKey) return { text: "" }

  const system = jsonMode
    ? `${systemPrompt ?? "You are a helpful assistant."}\n\nRespond with valid JSON only. No markdown fences.`
    : (systemPrompt ?? "You are a helpful assistant.")

  const claudeMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role as "user" | "assistant",
    content: typeof m.content === "string" ? m.content : (m.content as ContentPart[]).map((p) => {
      if (p.type === "text") return { type: "text", text: p.text ?? "" }
      return { type: "text", text: "[image]" }
    }),
  }))

  const body: Record<string, unknown> = { model, max_tokens: maxOutputTokens, temperature, system, messages: claudeMessages }
  if (thinking) { body.thinking = { type: "enabled", budget_tokens: 10000 }; body.temperature = 1 }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "interleaved-thinking-2025-05-14",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { text: "", thinking: undefined, usage: undefined }
    }
    const data = await res.json()
    let text = ""
    let thinkingText = ""
    for (const block of data.content ?? []) {
      if (block.type === "thinking") thinkingText += block.thinking ?? ""
      if (block.type === "text") text += block.text ?? ""
    }
    const usage = data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens, model } : undefined
    return { text, thinking: thinkingText || undefined, usage }
  } catch {
    return { text: "" }
  }
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

async function* streamOllama(opts: RouterOptions): AsyncGenerator<RouterChunk> {
  const { model, messages, systemPrompt, temperature = 0.7, ollamaEndpoint = "http://localhost:11434" } = opts
  const ollamaModel = model.replace(/^ollama:/, "")

  const ollamaMessages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : (m.content as ContentPart[]).map((p) => p.text ?? "").join(""),
    })),
  ]

  let res: Response
  try {
    res = await fetch(`${ollamaEndpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, messages: ollamaMessages, stream: true, options: { temperature } }),
    })
  } catch (e) {
    yield { error: `Ollama connection failed: ${e}. Is Ollama running at ${ollamaEndpoint}?` }
    return
  }

  if (!res.ok) { yield { error: `Ollama ${res.status}: ${await res.text()}` }; return }
  const reader = res.body?.getReader()
  if (!reader) { yield { error: "No response body" }; return }

  const decoder = new TextDecoder()
  let totalInput = 0
  let totalOutput = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    for (const line of text.split("\n").filter(Boolean)) {
      try {
        const evt = JSON.parse(line)
        if (evt.message?.content) yield { delta: evt.message.content }
        if (evt.done && evt.prompt_eval_count) {
          totalInput = evt.prompt_eval_count
          totalOutput = evt.eval_count ?? 0
        }
      } catch {}
    }
  }

  yield { done: true, usage: { input: totalInput, output: totalOutput, model } }
}

async function completeOllama(opts: RouterOptions): Promise<{ text: string; usage?: RouterChunk["usage"] }> {
  let text = ""
  let usage: RouterChunk["usage"] | undefined
  for await (const chunk of streamOllama(opts)) {
    if (chunk.delta) text += chunk.delta
    if (chunk.usage) usage = chunk.usage
  }
  return { text, usage }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function* streamModel(opts: RouterOptions): AsyncGenerator<RouterChunk> {
  const provider = modelProvider(opts.model)
  if (provider === "anthropic") yield* streamClaude(opts)
  else if (provider === "ollama") yield* streamOllama(opts)
  else yield* streamGemini(opts)
}

export async function completeModel(opts: RouterOptions): Promise<{ text: string; thinking?: string; usage?: RouterChunk["usage"] }> {
  const provider = modelProvider(opts.model)
  if (provider === "anthropic") return completeClaude(opts)
  if (provider === "ollama") return completeOllama(opts)
  return completeGemini(opts)
}

/** Strip markdown code fences and extract JSON from model output */
export function extractJSON(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim()
}
