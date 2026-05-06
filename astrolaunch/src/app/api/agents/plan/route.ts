import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const runtime = "nodejs"

const PLANNER_SYSTEM = `You are the Architect agent inside the AstroLaunch IDE.
Decompose the user's goal into 3-8 small, independently-verifiable tasks.
Each task MUST include doneCriteria that is concretely checkable (a file exists, a route returns 200, a component renders, etc.).
Return STRICT JSON ONLY in the form:
{ "plan": [ { "title": "...", "description": "...", "doneCriteria": "..." } ] }`

export async function POST(req: NextRequest) {
  try {
    const { goal, apiKey, model = "gemini-2.5-pro" } = await req.json()
    if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 })
    if (!goal) return NextResponse.json({ error: "Missing goal" }, { status: 400 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const m = genAI.getGenerativeModel({
      model,
      systemInstruction: PLANNER_SYSTEM,
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    })
    const result = await m.generateContent(`Goal: ${goal}\n\nReturn the JSON plan now.`)
    const text = result.response.text()
    const usageMeta = (result.response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    let parsed: { plan?: unknown } = {}
    try { parsed = JSON.parse(text) } catch { parsed = { plan: [] } }
    return NextResponse.json({
      ...parsed,
      usage: {
        input: usageMeta?.promptTokenCount ?? Math.ceil((PLANNER_SYSTEM.length + goal.length) / 4),
        output: usageMeta?.candidatesTokenCount ?? Math.ceil(text.length / 4),
        model,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
