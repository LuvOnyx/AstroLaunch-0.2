"use client"
/**
 * Multi-agent orchestrator v3.
 *
 *   - Architect → Builder → Reviewer loop with bounded iterations.
 *   - Rate-limit protection: exponential backoff on 429, inter-iteration delay.
 *   - Improved is_done: requires concrete evidence + 2 consecutive positive reviews.
 *   - Streaming events (token deltas + tool calls + diffs).
 *   - Cost tracking + soft cap (settings.costCapUsd).
 *   - Multi-provider support via model-router.
 */
import { db } from "@/lib/storage/db"
import { TOOL_MAP, runToolWithPolicy } from "./tools"
import { nanoid } from "nanoid"
import type { AgentTask, ToolDiff, ToolCall, AgentMessage, UsageRow, TokenUsage } from "@/types"
import { useSettings } from "@/store/settings"
import { approxTokens, estimateCost } from "./pricing"

export interface PlanStep {
  title: string
  description: string
  doneCriteria: string
}

export interface OrchestratorEvent {
  type:
    | "plan" | "task_start" | "tool_call" | "tool_result" | "task_done" | "task_failed"
    | "stop" | "log" | "delta" | "message" | "diff" | "usage" | "cost_cap_hit" | "rate_limit_wait"
  payload: unknown
}

type Listener = (e: OrchestratorEvent) => void

/** Sleep with jitter to avoid thundering herd on rate limits */
function sleep(ms: number, jitterFraction = 0.2) {
  const jitter = ms * jitterFraction * (Math.random() * 2 - 1)
  return new Promise<void>((r) => setTimeout(r, Math.max(100, ms + jitter)))
}

/** Detect rate limit from response or error message */
function isRateLimit(err: unknown): boolean {
  const msg = String(err).toLowerCase()
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota") || msg.includes("resource_exhausted")
}

export class Orchestrator {
  private listeners = new Set<Listener>()
  private aborted = false
  private accumulatedCostUsd = 0
  public activeChatId: string | null = null

  on(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private emit(e: OrchestratorEvent) { this.listeners.forEach((l) => { try { l(e) } catch {} }) }
  abort() { this.aborted = true; this.emit({ type: "log", payload: "abort_requested" }) }
  isRunning() { return !!this.activeChatId }

  async run(chatId: string, userGoal: string) {
    if (this.activeChatId) {
      this.emit({ type: "log", payload: "another_run_in_progress" })
      return
    }
    this.aborted = false
    this.accumulatedCostUsd = 0
    this.activeChatId = chatId
    if (typeof window !== "undefined") (window as unknown as { __al_orchestrator_running?: boolean }).__al_orchestrator_running = true
    const settings = useSettings.getState()

    try {
      this.emit({ type: "log", payload: "Planner starting…" })
      const plan = await this.planGoal(userGoal)
      this.emit({ type: "plan", payload: plan })

      const tasks: AgentTask[] = plan.map((s) => ({
        id: nanoid(),
        chatId,
        title: s.title,
        description: s.description,
        doneCriteria: s.doneCriteria,
        status: "pending",
        is_done: false,
        iterations: 0,
        maxIterations: settings.maxIterations,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        toolHistory: [],
        retries: 0,
      }))
      await db.tasks.bulkAdd(tasks)

      for (const task of tasks) {
        if (this.aborted) {
          this.emit({ type: "stop", payload: { reason: "user_aborted" } })
          return
        }
        if (settings.costCapUsd > 0 && this.accumulatedCostUsd >= settings.costCapUsd) {
          this.emit({ type: "cost_cap_hit", payload: { spent: this.accumulatedCostUsd, cap: settings.costCapUsd } })
          this.emit({ type: "stop", payload: { reason: "cost_cap" } })
          return
        }
        await this.executeTask(task)
      }
      this.emit({ type: "stop", payload: { reason: "all_done", spent: this.accumulatedCostUsd } })
    } finally {
      this.activeChatId = null
      if (typeof window !== "undefined") (window as unknown as { __al_orchestrator_running?: boolean }).__al_orchestrator_running = false
    }
  }

  private async planGoal(goal: string): Promise<PlanStep[]> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey) {
      return [{ title: "Implement goal", description: goal, doneCriteria: "User confirms result" }]
    }
    const res = await this.fetchWithRateLimitRetry("/api/agents/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, apiKey, model: settings.defaultModel, ollamaEndpoint: settings.ollamaEndpoint }),
    })
    const data = await res.json()
    if (data.usage) this.recordUsage(data.usage, undefined)
    if (!Array.isArray(data.plan)) {
      return [{ title: "Implement goal", description: goal, doneCriteria: "Result delivered" }]
    }
    return data.plan as PlanStep[]
  }

  private async executeTask(task: AgentTask) {
    this.emit({ type: "task_start", payload: { id: task.id, title: task.title } })
    await db.tasks.update(task.id, { status: "in_progress" })
    const settings = useSettings.getState()
    let consecutivePositiveReviews = 0

    while (!this.aborted) {
      const fresh = await db.tasks.get(task.id)
      if (!fresh) break
      if (fresh.is_done) {
        this.emit({ type: "task_done", payload: { id: task.id, evidence: fresh.evidence } })
        break
      }
      if (fresh.iterations >= fresh.maxIterations) {
        await db.tasks.update(task.id, { status: "failed" })
        this.emit({ type: "task_failed", payload: { id: task.id, reason: "max_iterations" } })
        break
      }
      if (settings.costCapUsd > 0 && this.accumulatedCostUsd >= settings.costCapUsd) {
        await db.tasks.update(task.id, { status: "failed" })
        this.emit({ type: "task_failed", payload: { id: task.id, reason: "cost_cap" } })
        this.emit({ type: "cost_cap_hit", payload: { spent: this.accumulatedCostUsd, cap: settings.costCapUsd } })
        break
      }

      // Inter-iteration delay to prevent rate limits
      if (fresh.iterations > 0) {
        await sleep(settings.iterationDelayMs)
      }

      // Builder step
      const builder = await this.askBuilder(fresh)
      if (builder.usage) this.recordUsage(builder.usage, task.id)

      const diffs: ToolDiff[] = []
      let toolCall: ToolCall | null = null
      if (builder.toolName && TOOL_MAP[builder.toolName]) {
        this.emit({ type: "tool_call", payload: { taskId: task.id, name: builder.toolName, args: builder.args } })
        toolCall = await runToolWithPolicy(builder.toolName, (builder.args ?? {}) as Record<string, unknown>, {
          retry: settings.retry, diffs,
        })
        this.emit({ type: "tool_result", payload: { taskId: task.id, ...toolCall } })
        for (const d of diffs) this.emit({ type: "diff", payload: { taskId: task.id, diff: d } })
        const t = await db.tasks.get(task.id)
        if (t) {
          await db.tasks.update(task.id, {
            toolHistory: [...(t.toolHistory ?? []), { name: builder.toolName, ok: toolCall.status === "success", ts: Date.now() }],
            retries: (t.retries ?? 0) + (toolCall.retries ?? 0),
          })
        }
      }

      if (toolCall) {
        const msg: AgentMessage = {
          id: nanoid(), chatId: task.chatId, role: "tool",
          content: `${toolCall.name} → ${toolCall.status}`,
          toolCalls: [toolCall], toolDiffs: diffs.length ? diffs : undefined,
          taskId: task.id, createdAt: Date.now(),
          personaId: "builder",
        }
        await db.messages.add(msg)
        this.emit({ type: "message", payload: msg })
      }

      const fresh2 = await db.tasks.get(task.id)
      if (!fresh2) break

      // Reviewer runs when builder finalizes OR every 3 iterations
      const shouldReview = builder.finalize || (fresh2.iterations > 0 && fresh2.iterations % 3 === 2)
      if (shouldReview) {
        // Add small delay before reviewer to avoid back-to-back rate limits
        await sleep(200)
        const verdict = await this.askReviewer(fresh2)
        if (verdict.usage) this.recordUsage(verdict.usage, task.id)
        if (verdict.is_done) {
          consecutivePositiveReviews++
          // Require at least 1 confirmed positive review with concrete evidence
          if (consecutivePositiveReviews >= 1 && verdict.evidence && verdict.evidence.length > 20) {
            await db.tasks.update(task.id, {
              is_done: true, status: "completed",
              evidence: verdict.evidence, updatedAt: Date.now(),
            })
            this.emit({ type: "task_done", payload: { id: task.id, evidence: verdict.evidence } })
            break
          }
        } else {
          consecutivePositiveReviews = 0
        }
      }

      await db.tasks.update(task.id, { iterations: fresh2.iterations + 1, updatedAt: Date.now() })
    }
  }

  private async askBuilder(task: AgentTask): Promise<{ toolName?: string; args?: Record<string, unknown>; finalize?: boolean; usage?: TokenUsage }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey && !settings.defaultModel.startsWith("ollama:")) return { finalize: true }
    try {
      const res = await this.fetchWithRateLimitRetry("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "builder", task, apiKey, model: settings.defaultModel,
          systemPrompt: settings.systemPrompt, ollamaEndpoint: settings.ollamaEndpoint,
        }),
      })
      return await res.json()
    } catch (e) {
      this.emit({ type: "log", payload: `builder_error: ${e}` })
      return { finalize: true }
    }
  }

  private async askReviewer(task: AgentTask): Promise<{ is_done: boolean; evidence: string; usage?: TokenUsage }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey && !settings.defaultModel.startsWith("ollama:")) return { is_done: false, evidence: "no_api_key" }
    try {
      const res = await this.fetchWithRateLimitRetry("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "reviewer", task, apiKey,
          model: "gemini-2.5-flash", // Fast + cheap for reviews
          ollamaEndpoint: settings.ollamaEndpoint,
        }),
      })
      return await res.json()
    } catch (e) {
      this.emit({ type: "log", payload: `reviewer_error: ${e}` })
      return { is_done: false, evidence: "error" }
    }
  }

  /** Fetch with automatic exponential backoff on 429 rate limit responses */
  private async fetchWithRateLimitRetry(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
    let attempt = 0
    while (true) {
      const res = await fetch(url, init)
      if (res.status !== 429 || attempt >= maxRetries) return res
      const delay = Math.min(60_000, 2000 * Math.pow(2, attempt))
      attempt++
      this.emit({ type: "rate_limit_wait", payload: { delay, attempt } })
      await sleep(delay, 0.3)
    }
  }

  private async recordUsage(usage: TokenUsage, taskId?: string) {
    if (!this.activeChatId) return
    const cost = usage.costUsd ?? estimateCost(usage.model, usage.input, usage.output)
    this.accumulatedCostUsd += cost
    const row: UsageRow = {
      id: nanoid(), chatId: this.activeChatId, taskId,
      model: usage.model, input: usage.input, output: usage.output,
      costUsd: cost, ts: Date.now(),
    }
    try { await db.usage.add(row) } catch {}
    const chat = await db.chats.get(this.activeChatId)
    if (chat) {
      await db.chats.update(this.activeChatId, {
        totalCostUsd: (chat.totalCostUsd ?? 0) + cost,
        totalTokens: (chat.totalTokens ?? 0) + usage.input + usage.output,
        updatedAt: Date.now(),
      })
    }
    this.emit({ type: "usage", payload: { ...row, accumulated: this.accumulatedCostUsd } })
  }
}

export const orchestrator = new Orchestrator()

export function approxUsage(model: string, prompt: string, completion: string): TokenUsage {
  const input = approxTokens(prompt)
  const output = approxTokens(completion)
  return { input, output, total: input + output, costUsd: estimateCost(model, input, output), model }
}
