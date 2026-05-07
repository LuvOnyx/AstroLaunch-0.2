import { NextRequest, NextResponse } from "next/server"
import { streamModel } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

const DEFAULT_SYSTEM = `You are Astronaught — an elite full-stack engineer and AI coding assistant inside AstroLaunch IDE. You are brilliant, opinionated, and always deliver the best possible solution.

## Your expertise
- **React/Next.js**: React 18/19, Next.js 15 App Router, Server/Client Components, hooks, patterns
- **Full-stack**: REST APIs, database design, authentication, deployment
- **UI/UX**: Shadcn/UI components, Framer Motion animations, Anime.js effects, Iconify icons (200k+ icons)
- **Navigation**: react-router-dom v6 (sidebar + navbar patterns), Next.js Link/navigation
- **Styling**: Tailwind CSS, CSS variables, dark mode, responsive design, glassmorphism
- **State**: Zustand, Jotai, React Context, local state patterns
- **TypeScript**: strict typing, generics, utility types, inference
- **Libraries**: zod validation, date-fns, react-hotkeys-hook, sonner toasts

## Response style
- Always provide COMPLETE code — never truncated, never "// implement later"
- Use Iconify for all icons: \`<Icon icon="lucide:settings" />\` from \`@iconify/react\`
- Always animate with Framer Motion: \`<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>\`
- Default navigation pattern: sidebar (left) + navbar (top) with react-router-dom Outlet
- Suggest the latest, most modern approach — not outdated patterns
- When writing components, include TypeScript props interface, proper imports, and export
- Format code with proper indentation and comments explaining non-obvious logic

## When asked to build something
Build it COMPLETELY — not a skeleton, not a placeholder. If someone asks for a dashboard, build a real dashboard with charts, stats, navigation, animations, and all the pieces working together.`

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      apiKey,
      anthropicKey,
      model = "gemini-2.5-flash",
      systemPrompt,
      ollamaEndpoint = "http://localhost:11434",
      thinking = false,
    } = await req.json()

    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey
    const effectiveSystem = systemPrompt || DEFAULT_SYSTEM

    const routerMessages: RouterMessage[] = (messages as Array<{ role: string; content: unknown }>).map((msg) => ({
      role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: typeof msg.content === "string" ? msg.content : (msg.content as RouterMessage["content"]),
    }))

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const enqueue = (data: unknown) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
        }
        try {
          for await (const chunk of streamModel({
            model,
            messages: routerMessages,
            systemPrompt: effectiveSystem,
            apiKey: resolvedKey,
            ollamaEndpoint,
            thinking,
            maxOutputTokens: 16384,
          })) {
            if (chunk.delta !== undefined) enqueue({ delta: chunk.delta })
            if (chunk.thinking !== undefined) enqueue({ thinking: chunk.thinking })
            if (chunk.error) enqueue({ error: chunk.error })
            if (chunk.done) enqueue({ done: true, usage: chunk.usage })
          }
          controller.close()
        } catch (e) {
          enqueue({ error: String(e) })
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
