import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const runtime = "nodejs"

/**
 * Streaming chat completion for free-form agent conversation.
 *
 * v2 changes:
 *   - SSE-style chunked transfer with explicit "data:" frames so the client
 *     can distinguish content tokens from a final usage line.
 *   - Trailing JSON usage frame: { usage: { input, output, model, costUsd } }.
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, apiKey, model = "gemini-2.5-pro", systemPrompt } = await req.json()
    if (!apiKey) return NextResponse.json({ error: "Missing API key — open Settings → Agents." }, { status: 400 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const m = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt || "You are a helpful coding agent in the AstroLaunch IDE.",
    })

    const history = (messages as Array<{ role: string; content: string }>).slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }))
    const last = messages[messages.length - 1]?.content ?? ""
    const chat = m.startChat({ history })
    const stream = await chat.sendMessageStream(last)

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let outputText = ""
        try {
          for await (const chunk of stream.stream) {
            const text = chunk.text()
            if (text) {
              outputText += text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`))
            }
          }
          // Pull total usage if Gemini reports it
          const final = await stream.response
          const usageMeta = (final as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
          const inputTokens = usageMeta?.promptTokenCount ?? Math.ceil((systemPrompt ?? "").length / 4 + JSON.stringify(messages).length / 4)
          const outputTokens = usageMeta?.candidatesTokenCount ?? Math.ceil(outputText.length / 4)
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ done: true, usage: { input: inputTokens, output: outputTokens, model } })}\n\n`
          ))
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
