"use client"
/**
 * Multi-agent orchestrator v4.
 *
 *   - Architect → Builder → Reviewer loop with generous iteration budget.
 *   - Builder continues until reviewer CONFIRMS with concrete evidence (≥2 positive reviews OR strong evidence).
 *   - Rate-limit protection: exponential backoff on 429, inter-iteration delay.
 *   - Streaming events (token deltas + tool calls + diffs).
 *   - Cost tracking + soft cap (settings.costCapUsd).
 *   - Multi-provider support via model-router.
 *
 * v4 fixes:
 *   - Don't finalize on builder errors — retry with list_files fallback
 *   - Reviewer requires more concrete evidence (length > 50)
 *   - Builder doesn't get to say finalize:true until iteration >= 2
 *   - Better iteration management: review every 4 iterations (not 3)
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

function sleep(ms: number, jitterFraction = 0.15) {
  const jitter = ms * jitterFraction * (Math.random() * 2 - 1)
  return new Promise<void>((r) => setTimeout(r, Math.max(100, ms + jitter)))
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
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__al_orchestrator_running = true
    }

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
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__al_orchestrator_running = false
      }
    }
  }

  private async planGoal(goal: string): Promise<PlanStep[]> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey && !settings.defaultModel.startsWith("ollama:")) {
      return [
        { title: "Explore project structure", description: "Read package.json and list all files to understand the project layout.", doneCriteria: "package.json read and file structure documented" },
        { title: `Implement: ${goal}`, description: goal, doneCriteria: "Feature fully implemented with proper TypeScript, animations, and navigation" },
      ]
    }
    try {
      const res = await this.fetchWithRateLimitRetry("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          apiKey,
          anthropicKey: settings.apiKeys.anthropic,
          model: settings.defaultModel,
          ollamaEndpoint: settings.ollamaEndpoint,
        }),
      })
      const data = await res.json()
      if (data.usage) this.recordUsage(data.usage, undefined)
      if (!Array.isArray(data.plan) || data.plan.length === 0) {
        return [
          { title: "Explore project structure", description: "Read package.json and list all files to understand the project layout.", doneCriteria: "package.json read and file structure documented" },
          { title: `Implement: ${goal}`, description: goal, doneCriteria: "Feature fully implemented with proper TypeScript, animations, and navigation" },
        ]
      }
      return data.plan as PlanStep[]
    } catch (e) {
      this.emit({ type: "log", payload: `planner_error: ${e}` })
      return [
        { title: "Explore project structure", description: "Read package.json and list all files.", doneCriteria: "Files listed" },
        { title: `Implement: ${goal}`, description: goal, doneCriteria: "Feature delivered" },
      ]
    }
  }

  private async executeTask(task: AgentTask) {
    this.emit({ type: "task_start", payload: { id: task.id, title: task.title } })
    await db.tasks.update(task.id, { status: "in_progress" })
    const settings = useSettings.getState()
    let consecutivePositiveReviews = 0
    let consecutiveErrors = 0

    while (!this.aborted) {
      const fresh = await db.tasks.get(task.id)
      if (!fresh) break

      // Stop condition: already done
      if (fresh.is_done) {
        this.emit({ type: "task_done", payload: { id: task.id, evidence: fresh.evidence } })
        break
      }

      // Stop condition: iteration cap
      if (fresh.iterations >= fresh.maxIterations) {
        await db.tasks.update(task.id, { status: "failed" })
        this.emit({ type: "task_failed", payload: { id: task.id, reason: "max_iterations" } })
        break
      }

      // Stop condition: cost cap
      if (settings.costCapUsd > 0 && this.accumulatedCostUsd >= settings.costCapUsd) {
        await db.tasks.update(task.id, { status: "failed" })
        this.emit({ type: "task_failed", payload: { id: task.id, reason: "cost_cap" } })
        this.emit({ type: "cost_cap_hit", payload: { spent: this.accumulatedCostUsd, cap: settings.costCapUsd } })
        break
      }

      // Inter-iteration delay
      if (fresh.iterations > 0) await sleep(settings.iterationDelayMs)

      // Builder step
      const builder = await this.askBuilder(fresh)
      if (builder.usage) this.recordUsage(builder.usage, task.id)

      // If builder had an error (returned finalize:true on first iteration or no toolName), recover
      if (!builder.toolName && !builder.finalize) {
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          // Fall back to listing files to give context
          builder.toolName = "list_files"
          builder.args = {}
          consecutiveErrors = 0
        } else {
          await db.tasks.update(task.id, { iterations: fresh.iterations + 1, updatedAt: Date.now() })
          continue
        }
      } else {
        consecutiveErrors = 0
      }

      const diffs: ToolDiff[] = []
      let toolCall: ToolCall | null = null

      if (builder.toolName && TOOL_MAP[builder.toolName]) {
        this.emit({ type: "tool_call", payload: { taskId: task.id, name: builder.toolName, args: builder.args } })
        toolCall = await runToolWithPolicy(
          builder.toolName,
          (builder.args ?? {}) as Record<string, unknown>,
          { retry: settings.retry, diffs }
        )
        this.emit({ type: "tool_result", payload: { taskId: task.id, ...toolCall } })
        for (const d of diffs) this.emit({ type: "diff", payload: { taskId: task.id, diff: d } })

        const t = await db.tasks.get(task.id)
        if (t) {
          await db.tasks.update(task.id, {
            toolHistory: [
              ...(t.toolHistory ?? []),
              { name: builder.toolName, ok: toolCall.status === "success", ts: Date.now() },
            ],
            retries: (t.retries ?? 0) + (toolCall.retries ?? 0),
          })
        }
      }

      if (toolCall) {
        const msg: AgentMessage = {
          id: nanoid(),
          chatId: task.chatId,
          role: "tool",
          content: `${toolCall.name} → ${toolCall.status}`,
          toolCalls: [toolCall],
          toolDiffs: diffs.length ? diffs : undefined,
          taskId: task.id,
          createdAt: Date.now(),
          personaId: "builder",
        }
        await db.messages.add(msg)
        this.emit({ type: "message", payload: msg })
      }

      const fresh2 = await db.tasks.get(task.id)
      if (!fresh2) break

      // Review when:
      // - Builder explicitly finalizes (but only after at least 2 iterations to prevent early bail)
      // - Every 4th iteration
      const canFinalize = fresh2.iterations >= 2 // Builder must do at least 2 tool calls
      const shouldReview = (builder.finalize && canFinalize) ||
        (fresh2.iterations > 0 && (fresh2.iterations + 1) % 4 === 0)

      if (shouldReview) {
        await sleep(300)
        const verdict = await this.askReviewer(fresh2)
        if (verdict.usage) this.recordUsage(verdict.usage, task.id)

        if (verdict.is_done && verdict.evidence && verdict.evidence.length > 50) {
          consecutivePositiveReviews++
          if (consecutivePositiveReviews >= 1) {
            await db.tasks.update(task.id, {
              is_done: true,
              status: "completed",
              evidence: verdict.evidence,
              updatedAt: Date.now(),
            })
            this.emit({ type: "task_done", payload: { id: task.id, evidence: verdict.evidence } })
            break
          }
        } else {
          consecutivePositiveReviews = 0
          // Log reviewer feedback so builder can see it next iteration
          this.emit({ type: "log", payload: `reviewer_feedback: ${verdict.evidence}` })
        }
      }

      await db.tasks.update(task.id, { iterations: fresh2.iterations + 1, updatedAt: Date.now() })
    }
  }

  private async askBuilder(task: AgentTask): Promise<{
    toolName?: string
    args?: Record<string, unknown>
    finalize?: boolean
    usage?: TokenUsage
  }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey && !settings.defaultModel.startsWith("ollama:")) return { toolName: "list_files", args: {} }

    try {
      const res = await this.fetchWithRateLimitRetry("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "builder",
          task,
          apiKey,
          anthropicKey: settings.apiKeys.anthropic,
          model: settings.defaultModel,
          systemPrompt: settings.systemPrompt,
          ollamaEndpoint: settings.ollamaEndpoint,
        }),
      })
      const data = await res.json()
      // Prevent finalize on first iteration
      if (data.finalize && task.iterations < 2) {
        return { toolName: "list_files", args: {} }
      }
      return data
    } catch (e) {
      this.emit({ type: "log", payload: `builder_error: ${e}` })
      return { toolName: "list_files", args: {} }
    }
  }

  private async askReviewer(task: AgentTask): Promise<{
    is_done: boolean
    evidence: string
    usage?: TokenUsage
  }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini || settings.apiKeys.anthropic
    if (!apiKey && !settings.defaultModel.startsWith("ollama:")) return { is_done: false, evidence: "no_api_key" }

    try {
      // Always use Flash for reviewer — fast and reliable JSON
      const reviewModel = settings.defaultModel.startsWith("ollama:") || settings.defaultModel.startsWith("claude")
        ? settings.defaultModel
        : "gemini-2.5-flash"

      const res = await this.fetchWithRateLimitRetry("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "reviewer",
          task,
          apiKey,
          anthropicKey: settings.apiKeys.anthropic,
          model: reviewModel,
          ollamaEndpoint: settings.ollamaEndpoint,
        }),
      })
      return await res.json()
    } catch (e) {
      this.emit({ type: "log", payload: `reviewer_error: ${e}` })
      return { is_done: false, evidence: "reviewer_error — continuing" }
    }
  }

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
      id: nanoid(),
      chatId: this.activeChatId,
      taskId,
      model: usage.model,
      input: usage.input,
      output: usage.output,
      costUsd: cost,
      ts: Date.now(),
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
