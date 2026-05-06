"use client"
/**
 * Penpot bridge.
 *
 * Penpot is integrated by embedding a (self-hosted or cloud) Penpot file via iframe,
 * communicating through window.postMessage. We also support the Penpot Plugin API
 * (window.penpot) when AstroLaunch is loaded as a Penpot plugin.
 *
 * Configure via Settings → General → Penpot URL (defaults to https://design.penpot.app).
 */

export interface PenpotConfig {
  baseUrl: string
  fileId?: string
  pageId?: string
  accessToken?: string
}

export interface PenpotMessage {
  type: string
  payload?: unknown
}

export class PenpotBridge {
  private iframe: HTMLIFrameElement | null = null
  private listeners = new Map<string, Set<(p: unknown) => void>>()
  private config: PenpotConfig

  constructor(config: PenpotConfig) {
    this.config = config
    if (typeof window !== "undefined") {
      window.addEventListener("message", this.handleMessage)
    }
  }

  attach(iframe: HTMLIFrameElement) {
    this.iframe = iframe
  }

  detach() {
    this.iframe = null
    if (typeof window !== "undefined") window.removeEventListener("message", this.handleMessage)
  }

  buildEmbedUrl() {
    const { baseUrl, fileId, pageId } = this.config
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/`)
    if (fileId) {
      url.pathname = `/#/workspace`
      url.searchParams.set("file-id", fileId)
      if (pageId) url.searchParams.set("page-id", pageId)
    }
    url.searchParams.set("embed", "true")
    return url.toString()
  }

  private handleMessage = (e: MessageEvent) => {
    if (typeof e.data !== "object" || !e.data) return
    const msg = e.data as PenpotMessage
    if (!msg.type) return
    const set = this.listeners.get(msg.type)
    set?.forEach((fn) => fn(msg.payload))
  }

  on(type: string, fn: (p: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
    return () => this.listeners.get(type)?.delete(fn)
  }

  send(type: string, payload?: unknown) {
    if (!this.iframe?.contentWindow) return
    this.iframe.contentWindow.postMessage({ type, payload, source: "astrolaunch" }, "*")
  }

  /** Export a frame as SVG and return source. */
  async exportFrameSvg(frameId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const off = this.on("export-svg", (p) => {
        const result = p as { frameId?: string; svg?: string }
        if (result?.frameId === frameId) { off(); resolve(result.svg ?? null) }
      })
      this.send("request-export-svg", { frameId })
      setTimeout(() => { off(); resolve(null) }, 5000)
    })
  }
}

export const DEFAULT_PENPOT_URL = "https://design.penpot.app"
