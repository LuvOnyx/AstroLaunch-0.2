import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const runtime = "nodejs"

/**
 * Free Gemini image generation endpoint.
 * Uses gemini-2.0-flash-preview-image-generation (free tier, no cost).
 * Returns: { images: [{ mimeType, base64 }], text?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, apiKey, count = 1 } = await req.json()
    if (!apiKey) return NextResponse.json({ error: "Missing Gemini API key" }, { status: 400 })
    if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 })

    const genAI = new GoogleGenerativeAI(apiKey)

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-preview-image-generation",
    })

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // @ts-expect-error - image generation specific config
        responseModalities: ["TEXT", "IMAGE"],
        candidateCount: Math.min(Number(count), 4),
      },
    })

    const images: { mimeType: string; base64: string }[] = []
    let text = ""

    for (const candidate of result.response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        const p = part as { text?: string; inlineData?: { mimeType: string; data: string } }
        if (p.text) text += p.text
        if (p.inlineData) {
          images.push({ mimeType: p.inlineData.mimeType, base64: p.inlineData.data })
        }
      }
    }

    const usageMeta = (result.response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata

    return NextResponse.json({
      images,
      text: text || undefined,
      usage: {
        input: usageMeta?.promptTokenCount ?? Math.ceil(prompt.length / 4),
        output: usageMeta?.candidatesTokenCount ?? 0,
        model: "gemini-2.0-flash-preview-image-generation",
        costUsd: 0,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
