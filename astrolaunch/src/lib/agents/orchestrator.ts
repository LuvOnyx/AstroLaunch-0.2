"use client"
/**
 * Multi-agent orchestrator v2.
 *
 *   - Architect → Builder → Reviewer loop with bounded iterations.
 *   - is_done flags require concrete evidence.
 *   - Streaming events (token deltas + tool calls + diffs).
 *   - Cost tracking + soft cap (settings.costCapUsd).
 *   - Retry policy applied per tool call.
 *   - Per-task retries counter + tool history.
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
    | "stop" | "log" | "delta" | "message" | "diff" | "usage" | "cost_cap_hit"
  payload: unknown
}

type Listener = (e: OrchestratorEvent) => void

export class Orchestrator {
  private listeners = new Set<Listener>()
  private aborted = false
  private accumulatedCostUsd = 0
  /** Currently running chat (one run at a time per orchestrator). */
  public activeChatId: string | null = null

  on(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private emit(e: OrchestratorEvent) { this.listeners.forEach((l) => { try { l(e) } catch {} }) }
  abort() { this.aborted = true; this.emit({ type: "log", payload: "abort_requested" }) }
  isRunning() { return !!this.activeChatId }

  /** Top-level entrypoint. Splits work, runs each task, verifies, stops at done or cap. */
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
      // 1. PLAN
      this.emit({ type: "log", payload: "Planner starting…" })
      const plan = await this.planGoal(userGoal)
      this.emit({ type: "plan", payload: plan })

      // 2. CREATE TASKS
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

      // 3. EXECUTE EACH TASK SEQUENTIALLY (with bounded iterations)
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

  /** Call Gemini to produce a JSON plan. */
  private async planGoal(goal: string): Promise<PlanStep[]> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini
    if (!apiKey) {
      // Graceful degradation: emit a single-step plan
      return [{ title: "Implement goal", description: goal, doneCriteria: "User confirms result" }]
    }
    const res = await fetch("/api/agents/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, apiKey, model: settings.defaultModel }),
    })
    const data = await res.json()
    if (data.usage) this.recordUsage(data.usage, undefined)
    if (!Array.isArray(data.plan)) {
      return [{ title: "Implement goal", description: goal, doneCriteria: "Result delivered" }]
    }
    return data.plan as PlanStep[]
  }

  /** Run one task in a bounded loop until is_done or max iterations. */
  private async executeTask(task: AgentTask) {
    this.emit({ type: "task_start", payload: { id: task.id, title: task.title } })
    await db.tasks.update(task.id, { status: "in_progress" })

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
      const settings = useSettings.getState()
      if (settings.costCapUsd > 0 && this.accumulatedCostUsd >= settings.costCapUsd) {
        await db.tasks.update(task.id, { status: "failed" })
        this.emit({ type: "task_failed", payload: { id: task.id, reason: "cost_cap" } })
        this.emit({ type: "cost_cap_hit", payload: { spent: this.accumulatedCostUsd, cap: settings.costCapUsd } })
        break
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

      // Persist a tool message into the chat for transcript clarity
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

      // Reviewer step (verifies doneCriteria) — runs when builder asked to finalize OR after every 3 iterations
      const fresh2 = await db.tasks.get(task.id)
      if (!fresh2) break
      const shouldReview = builder.finalize || fresh2.iterations > 0 && fresh2.iterations % 3 === 2
      if (shouldReview) {
        const verdict = await this.askReviewer(fresh2)
        if (verdict.usage) this.recordUsage(verdict.usage, task.id)
        if (verdict.is_done) {
          await db.tasks.update(task.id, {
            is_done: true, status: "completed",
            evidence: verdict.evidence, updatedAt: Date.now(),
          })
          this.emit({ type: "task_done", payload: { id: task.id, evidence: verdict.evidence } })
          break
        }
      }

      await db.tasks.update(task.id, { iterations: fresh2.iterations + 1, updatedAt: Date.now() })
    }
  }

  private async askBuilder(task: AgentTask): Promise<{ toolName?: string; args?: Record<string, unknown>; finalize?: boolean; usage?: TokenUsage }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini
    if (!apiKey) return { finalize: true } // no key → fall through to reviewer
    const res = await fetch("/api/agents/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "builder",
        task,
        apiKey,
        model: settings.defaultModel,
        systemPrompt: settings.systemPrompt,
      }),
    })
    return await res.json()
  }

  private async askReviewer(task: AgentTask): Promise<{ is_done: boolean; evidence: string; usage?: TokenUsage }> {
    const settings = useSettings.getState()
    const apiKey = settings.apiKeys.gemini
    if (!apiKey) return { is_done: false, evidence: "no_api_key" }
    const res = await fetch("/api/agents/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "reviewer", task, apiKey, model: "gemini-2.5-flash",
      }),
    })
    return await res.json()
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
    // Also bump the chat aggregate
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

// Singleton orchestrator (one run at a time per chat is enforced by UI)
export const orchestrator = new Orchestrator()

/** Helper for non-orchestrator callers that just want token + cost from a string. */
export function approxUsage(model: string, prompt: string, completion: string): TokenUsage {
  const input = approxTokens(prompt)
  const output = approxTokens(completion)
  return { input, output, total: input + output, costUsd: estimateCost(model, input, output), model }
}
