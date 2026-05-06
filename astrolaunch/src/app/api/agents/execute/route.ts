import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const runtime = "nodejs"

const BUILDER_SYSTEM = (extra: string) => `You are the Builder agent inside AstroLaunch.
You can call exactly ONE tool per turn from this set:
- read_file(path)
- write_file(path, content)
- list_files(prefix?)
- delete_file(path)
- search_files(query, maxResults?)
- run_command(command)
- http_fetch(url, maxBytes?)

When the task's doneCriteria is satisfied, return finalize:true so the Reviewer can verify.
Return STRICT JSON: { "toolName": "...", "args": {...}, "finalize": false } OR { "finalize": true }.
${extra}`

const REVIEWER_SYSTEM = `You are the Reviewer agent. Inspect the workspace state via the task's evidence trail.
Decide whether the doneCriteria is met. Return STRICT JSON:
{ "is_done": true|false, "evidence": "concrete description of what proves it" }
Be strict. Only accept with concrete evidence.`

export async function POST(req: NextRequest) {
  try {
    const { role, task, apiKey, model = "gemini-2.5-pro", systemPrompt = "" } = await req.json()
    if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const sys = role === "reviewer" ? REVIEWER_SYSTEM : BUILDER_SYSTEM(systemPrompt)
    const m = genAI.getGenerativeModel({
      model,
      systemInstruction: sys,
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    })

    const toolHistory = Array.isArray(task.toolHistory) ? task.toolHistory.slice(-8) : []
    const historyHint = toolHistory.length
      ? `\nRecent tool history (last ${toolHistory.length}):\n${toolHistory.map((h: { name: string; ok: boolean }) => `- ${h.name} → ${h.ok ? "ok" : "error"}`).join("\n")}`
      : ""

    const prompt = role === "reviewer"
      ? `Task: ${task.title}\nDescription: ${task.description}\nDoneCriteria: ${task.doneCriteria}\nIterations so far: ${task.iterations}${historyHint}\nDecide is_done with evidence. JSON only.`
      : `Task: ${task.title}\nDescription: ${task.description}\nDoneCriteria: ${task.doneCriteria}\nIteration: ${task.iterations}/${task.maxIterations}${historyHint}\nReturn the next single tool call OR finalize:true. JSON only.`

    const result = await m.generateContent(prompt)
    const text = result.response.text()
    const usageMeta = (result.response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(text) } catch { parsed = role === "reviewer" ? { is_done: false, evidence: "parse_error" } : { finalize: true } }
    return NextResponse.json({
      ...parsed,
      usage: {
        input: usageMeta?.promptTokenCount ?? Math.ceil((sys.length + prompt.length) / 4),
        output: usageMeta?.candidatesTokenCount ?? Math.ceil(text.length / 4),
        model,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
