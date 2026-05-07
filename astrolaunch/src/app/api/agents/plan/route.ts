import { NextRequest, NextResponse } from "next/server"
import { completeModel, extractJSON } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

const PLANNER_SYSTEM = `You are the Architect — a principal engineer who plans software implementations inside AstroLaunch IDE.

## Your job
Decompose the user's goal into 4-8 concrete, independently-verifiable tasks that together deliver a complete, production-quality implementation.

## Planning principles
1. ALWAYS plan for a COMPLETE implementation — never plan partial features.
2. Default to including BOTH sidebar navigation AND navbar navigation unless told otherwise.
3. Plan for animations (Framer Motion / Anime.js) and proper UX micro-interactions.
4. Plan for proper TypeScript types, error handling, and loading states.
5. The first task should ALWAYS be: read package.json + list files to understand the project structure.
6. Include install_deps tasks if new libraries are needed.
7. Order tasks so each builds on the previous.

## Tech stack context
The workspace may contain React, Next.js 15 App Router, TypeScript, Tailwind CSS.
Available libraries: Shadcn/UI (@/components/ui/*), Framer Motion, Anime.js v4, Iconify (@iconify/react),
sonner (toast), zustand, zod, date-fns, react-hotkeys-hook, dexie (IndexedDB).
Navigation: react-router-dom v6 OR Next.js Link/navigation.

## DoneCriteria rules
Each task MUST have doneCriteria that is CONCRETELY checkable:
- "File /src/components/Sidebar.tsx exists and exports a Sidebar component with Icon-based nav links"
- "File /src/app/page.tsx renders the full layout with sidebar + navbar + main content area"
- "All animations use Framer Motion with proper initial/animate/exit props"
NOT vague like "component works" or "user can navigate"

## Response format
Return STRICT JSON ONLY — no markdown, no explanation, no code fences:
{ "plan": [ { "title": "...", "description": "...", "doneCriteria": "..." } ] }

Generate 4-8 tasks. More complex features need more tasks.`

export async function POST(req: NextRequest) {
  try {
    const {
      goal, apiKey, anthropicKey,
      model = "gemini-2.5-flash",
      ollamaEndpoint = "http://localhost:11434",
    } = await req.json()

    if (!goal) return NextResponse.json({ error: "Missing goal" }, { status: 400 })
    if (!apiKey && !anthropicKey && !model.startsWith("ollama:")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 })
    }

    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey

    // Use flash for planning (fast, reliable JSON output)
    // Pro can be used but may have JSON mode issues — use flash as reliable fallback
    const planModel = model.startsWith("ollama:") || model.startsWith("claude")
      ? model
      : "gemini-2.5-flash"

    const messages: RouterMessage[] = [{
      role: "user",
      content: `Goal: ${goal}

Return the JSON plan now. Include 4-8 tasks that together implement the COMPLETE feature. Return JSON only.`
    }]

    const result = await completeModel({
      model: planModel,
      messages,
      systemPrompt: PLANNER_SYSTEM,
      apiKey: resolvedKey,
      ollamaEndpoint,
      temperature: 0.2,
      maxOutputTokens: 4096,
      jsonMode: !planModel.includes("2.5-pro"),
    })

    let parsed: { plan?: unknown } = {}
    try {
      const raw = extractJSON(result.text)
      parsed = JSON.parse(raw)
    } catch {
      // Try to find JSON anywhere in the response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch {}
      }
      if (!parsed.plan) {
        parsed = {
          plan: [
            { title: "Explore project structure", description: "Read package.json and list existing files to understand the project layout and available libraries.", doneCriteria: "package.json has been read and file structure is known" },
            { title: `Implement: ${goal}`, description: goal, doneCriteria: "Feature fully implemented with proper TypeScript, animations, and navigation" },
          ]
        }
      }
    }

    return NextResponse.json({
      ...parsed,
      thinking: result.thinking,
      usage: result.usage ?? {
        input: Math.ceil((PLANNER_SYSTEM.length + goal.length) / 4),
        output: Math.ceil(result.text.length / 4),
        model: planModel,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
