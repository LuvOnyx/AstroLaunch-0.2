import { NextRequest, NextResponse } from "next/server"
import { streamModel } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

/**
 * Multi-provider streaming chat completion.
 * Supports: Gemini, Claude (Anthropic), Ollama
 * SSE format: data: { delta? } | data: { thinking? } | data: { done, usage } | data: { error }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      apiKey,
      anthropicKey,
      model = "gemini-2.5-pro",
      systemPrompt,
      ollamaEndpoint = "http://localhost:11434",
      thinking = false,
    } = await req.json()

    // Pick the right API key based on model
    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey

    const routerMessages: RouterMessage[] = (messages as Array<{ role: string; content: unknown }>).map((msg) => ({
      role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: typeof msg.content === "string" ? msg.content : (msg.content as RouterMessage["content"]),
    }))

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamModel({
            model,
            messages: routerMessages,
            systemPrompt: systemPrompt || "You are a helpful coding agent in the AstroLaunch IDE.",
            apiKey: resolvedKey,
            ollamaEndpoint,
            thinking,
          })) {
            if (chunk.delta !== undefined) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`))
            }
            if (chunk.thinking !== undefined) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: chunk.thinking })}\n\n`))
            }
            if (chunk.error) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: chunk.error })}\n\n`))
            }
            if (chunk.done) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, usage: chunk.usage })}\n\n`))
            }
          }
          controller.close()
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`))
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
