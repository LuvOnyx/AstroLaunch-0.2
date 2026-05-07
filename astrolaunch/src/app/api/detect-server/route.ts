/**
 * /api/detect-server — polls common localhost ports from the server side.
 *
 * Browser-side fetches to localhost produce ERR_CONNECTION_REFUSED console
 * noise and may trigger error overlays.  Doing the check server-side avoids
 * all of that.
 *
 * GET /api/detect-server          — check default ports
 * GET /api/detect-server?port=3000 — check a specific port
 * Returns: { url: string | null }
 */
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const DEFAULT_PORTS = [3000, 3001, 4173, 5173, 8080, 8000, 4000]

async function checkPort(port: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 600)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "HEAD",
      signal: controller.signal,
    })
    clearTimeout(timer)
    return res.status < 500
  } catch {
    clearTimeout(timer)
    return false
  }
}

export async function GET(req: NextRequest) {
  const portParam = req.nextUrl.searchParams.get("port")

  if (portParam) {
    const port = parseInt(portParam, 10)
    const alive = await checkPort(port)
    return NextResponse.json({ url: alive ? `http://localhost:${port}` : null })
  }

  for (const port of DEFAULT_PORTS) {
    if (await checkPort(port)) {
      return NextResponse.json({ url: `http://localhost:${port}` })
    }
  }

  return NextResponse.json({ url: null })
}
