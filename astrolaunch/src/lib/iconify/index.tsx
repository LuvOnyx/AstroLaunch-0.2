"use client"
/**
 * Iconify wrapper with on-demand JSON loading + brand color icons.
 * Uses @iconify/react with an internal manifest of approved icon names.
 */
import { Icon as IconifyIcon, IconProps as IconifyProps } from "@iconify/react"
import * as React from "react"

export const ICON_MANIFEST = {
  // Brand / language
  react: "logos:react",
  next: "logos:nextjs-icon",
  vue: "logos:vue",
  svelte: "logos:svelte-icon",
  typescript: "logos:typescript-icon",
  javascript: "logos:javascript",
  python: "logos:python",
  rust: "logos:rust",
  go: "logos:go",
  html: "logos:html-5",
  css: "logos:css-3",
  tailwind: "logos:tailwindcss-icon",
  json: "vscode-icons:file-type-json",
  markdown: "vscode-icons:file-type-markdown",
  // Tools / providers
  github: "mdi:github",
  git: "logos:git-icon",
  gemini: "logos:google-bard-icon",
  openai: "simple-icons:openai",
  anthropic: "simple-icons:anthropic",
  openrouter: "simple-icons:openai",
  figma: "logos:figma",
  penpot: "simple-icons:penpot",
  // UI / actions
  folder: "mdi:folder",
  "folder-open": "mdi:folder-open",
  file: "mdi:file-outline",
  settings: "mdi:cog",
  search: "mdi:magnify",
  play: "mdi:play",
  stop: "mdi:stop",
  pause: "mdi:pause",
  refresh: "mdi:refresh",
  plus: "mdi:plus",
  minus: "mdi:minus",
  trash: "mdi:trash-can-outline",
  branch: "mdi:source-branch",
  commit: "mdi:source-commit",
  pullRequest: "mdi:source-pull",
  agent: "mdi:robot-outline",
  chat: "mdi:message-text-outline",
  canvas: "mdi:palette-outline",
  preview: "mdi:eye-outline",
  terminal: "mdi:console",
  layout: "mdi:view-dashboard-outline",
  drag: "mdi:drag",
  check: "mdi:check-bold",
  close: "mdi:close",
  // v0.2 additions
  puzzle: "mdi:puzzle-outline",
  diff: "mdi:source-merge",
  bolt: "mdi:lightning-bolt-outline",
  warning: "mdi:alert-outline",
  error: "mdi:alert-circle-outline",
  info: "mdi:information-outline",
  success: "mdi:check-circle-outline",
  download: "mdi:download-outline",
  upload: "mdi:upload-outline",
  copy: "mdi:content-copy",
  edit: "mdi:pencil-outline",
  more: "mdi:dots-horizontal",
  arrowRight: "mdi:chevron-right",
  arrowDown: "mdi:chevron-down",
  ai: "mdi:auto-fix",
  spark: "mdi:creation",
  shield: "mdi:shield-outline",
  cost: "mdi:currency-usd",
} as const

export type IconKey = keyof typeof ICON_MANIFEST

interface AppIconProps extends Omit<IconifyProps, "icon"> {
  name: IconKey | string
}

export function AppIcon({ name, ...props }: AppIconProps) {
  const resolved = (ICON_MANIFEST as Record<string, string>)[name] ?? name
  return <IconifyIcon icon={resolved} {...props} />
}

export function FileIcon({ filename, ...props }: { filename: string } & Omit<IconifyProps, "icon">) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    tsx: "logos:react", jsx: "logos:react",
    ts: "logos:typescript-icon", js: "logos:javascript",
    py: "logos:python", rs: "logos:rust", go: "logos:go",
    html: "logos:html-5", css: "logos:css-3",
    json: "vscode-icons:file-type-json", md: "vscode-icons:file-type-markdown",
    vue: "logos:vue", svelte: "logos:svelte-icon",
    yml: "vscode-icons:file-type-yaml", yaml: "vscode-icons:file-type-yaml",
    sh: "vscode-icons:file-type-shell", env: "vscode-icons:file-type-dotenv",
    png: "vscode-icons:file-type-image", jpg: "vscode-icons:file-type-image",
    svg: "vscode-icons:file-type-svg",
  }
  return <IconifyIcon icon={map[ext] || "mdi:file-outline"} {...props} />
}
