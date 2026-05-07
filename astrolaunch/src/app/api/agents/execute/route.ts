import { NextRequest, NextResponse } from "next/server"
import { completeModel } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

const BUILDER_SYSTEM = (extra: string) => `You are the Builder agent inside AstroLaunch IDE.
You can call exactly ONE tool per turn from this set:
- read_file(path)
- write_file(path, content)
- list_files(prefix?)
- delete_file(path)
- search_files(query, maxResults?)
- run_command(command)
- install_deps(command)
- http_fetch(url, maxBytes?)

When the task's doneCriteria is satisfied, return finalize:true so the Reviewer can verify.
Return STRICT JSON: { "toolName": "...", "args": {...}, "finalize": false } OR { "finalize": true }.
NEVER return partial JSON. Always include either toolName+args or finalize:true.
${extra}`

const REVIEWER_SYSTEM = `You are the Reviewer agent in AstroLaunch IDE.
Inspect the workspace state via the task's evidence trail.
Decide whether the doneCriteria is CONCRETELY met. Return STRICT JSON:
{ "is_done": true|false, "evidence": "concrete description proving it is done (min 30 words)" }
REJECT if evidence is vague. Only accept with specific proof (file exists, output shows X, test passes, etc.).
Never accept "it should be done" — require verifiable evidence.`

export async function POST(req: NextRequest) {
  try {
    const {
      role, task, apiKey, anthropicKey,
      model = "gemini-2.5-flash",
      systemPrompt = "",
      ollamaEndpoint = "http://localhost:11434",
    } = await req.json()

    if (!apiKey && !anthropicKey && !model.startsWith("ollama:")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 })
    }

    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey

    const sys = role === "reviewer" ? REVIEWER_SYSTEM : BUILDER_SYSTEM(systemPrompt)

    const toolHistory = Array.isArray(task.toolHistory) ? task.toolHistory.slice(-8) : []
    const historyHint = toolHistory.length
      ? `\nRecent tool history (last ${toolHistory.length}):\n${toolHistory.map((h: { name: string; ok: boolean }) => `- ${h.name} → ${h.ok ? "ok" : "error"}`).join("\n")}`
      : ""

    const prompt = role === "reviewer"
      ? `Task: ${task.title}\nDescription: ${task.description}\nDoneCriteria: ${task.doneCriteria}\nIterations so far: ${task.iterations}${historyHint}\nDecide is_done with concrete evidence. JSON only.`
      : `Task: ${task.title}\nDescription: ${task.description}\nDoneCriteria: ${task.doneCriteria}\nIteration: ${task.iterations}/${task.maxIterations}${historyHint}\nReturn the next single tool call OR finalize:true. JSON only.`

    const messages: RouterMessage[] = [{ role: "user", content: prompt }]

    const result = await completeModel({
      model,
      messages,
      systemPrompt: sys,
      apiKey: resolvedKey,
      ollamaEndpoint,
      temperature: 0.4,
      jsonMode: true,
    })

    let parsed: Record<string, unknown> = {}
    try {
      // Strip markdown code fences if present
      const raw = result.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()
      parsed = JSON.parse(raw)
    } catch {
      parsed = role === "reviewer"
        ? { is_done: false, evidence: "parse_error" }
        : { finalize: true }
    }

    return NextResponse.json({
      ...parsed,
      thinking: result.thinking,
      usage: result.usage ?? {
        input: Math.ceil((sys.length + prompt.length) / 4),
        output: Math.ceil(result.text.length / 4),
        model,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
