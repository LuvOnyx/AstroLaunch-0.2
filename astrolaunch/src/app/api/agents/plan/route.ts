import { NextRequest, NextResponse } from "next/server"
import { completeModel } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

const PLANNER_SYSTEM = `You are the Architect agent inside the AstroLaunch IDE.
Decompose the user's goal into 3-8 small, independently-verifiable tasks.
Each task MUST include doneCriteria that is concretely checkable (a file exists, a route returns 200, a component renders, etc.).
Order tasks so each builds on the previous.
Return STRICT JSON ONLY in the form:
{ "plan": [ { "title": "...", "description": "...", "doneCriteria": "..." } ] }`

export async function POST(req: NextRequest) {
  try {
    const {
      goal, apiKey, anthropicKey,
      model = "gemini-2.5-pro",
      ollamaEndpoint = "http://localhost:11434",
    } = await req.json()

    if (!goal) return NextResponse.json({ error: "Missing goal" }, { status: 400 })
    if (!apiKey && !anthropicKey && !model.startsWith("ollama:")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 })
    }

    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey

    const messages: RouterMessage[] = [{ role: "user", content: `Goal: ${goal}\n\nReturn the JSON plan now.` }]

    const result = await completeModel({
      model,
      messages,
      systemPrompt: PLANNER_SYSTEM,
      apiKey: resolvedKey,
      ollamaEndpoint,
      temperature: 0.3,
      jsonMode: true,
    })

    let parsed: { plan?: unknown } = {}
    try {
      const raw = result.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()
      parsed = JSON.parse(raw)
    } catch {
      parsed = { plan: [] }
    }

    return NextResponse.json({
      ...parsed,
      thinking: result.thinking,
      usage: result.usage ?? {
        input: Math.ceil((PLANNER_SYSTEM.length + goal.length) / 4),
        output: Math.ceil(result.text.length / 4),
        model,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
