"use client"
/**
 * AttachmentBar — file + image attachment buttons for the agent chat input.
 * Files: reads from workspace DB or filesystem, injects as text context.
 * Images: base64 encodes and sends as vision multimodal input.
 */
import { useRef } from "react"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { db } from "@/lib/storage/db"

export interface Attachment {
  id: string
  type: "file" | "image"
  name: string
  /** Text content for files, base64 data URL for images */
  content: string
  mimeType?: string
}

interface Props {
  attachments: Attachment[]
  onAdd: (a: Attachment) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

function genId() { return Math.random().toString(36).slice(2) }

export function AttachmentBar({ attachments, onAdd, onRemove, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const text = await file.text()
      onAdd({
        id: genId(),
        type: "file",
        name: file.name,
        content: text,
        mimeType: file.type || "text/plain",
      })
    }
  }

  const handleImages = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        onAdd({
          id: genId(),
          type: "image",
          name: file.name,
          content: dataUrl,
          mimeType: file.type,
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const pickWorkspaceFile = async () => {
    if (!db) return
    const files = await db.files.where("type").equals("file").toArray()
    if (files.length === 0) return
    // Show picker — simple prompt for now
    const paths = files.map((f) => f.path).join("\n")
    const chosen = prompt(`Pick a workspace file (paste path):\n\n${paths}`)
    if (!chosen) return
    const node = files.find((f) => f.path === chosen.trim())
    if (!node) return
    onAdd({
      id: genId(),
      type: "file",
      name: node.name,
      content: node.content ?? "",
    })
  }

  return (
    <div className="flex items-center gap-1">
      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.ts,.tsx,.js,.jsx,.py,.json,.yaml,.yml,.html,.css,.rs,.go,.java,.cpp,.c,.cs,.rb,.sh,.toml,.env"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleImages(e.target.files)}
      />

      {/* File attach button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach file (read into context)"
        className={cn(
          "p-1 rounded hover:bg-foreground/10 transition text-muted-foreground hover:text-foreground",
          disabled && "opacity-40 pointer-events-none"
        )}
      >
        <AppIcon name="file" width={13} />
      </button>

      {/* Workspace file picker */}
      <button
        onClick={pickWorkspaceFile}
        disabled={disabled}
        title="Pick from workspace"
        className={cn(
          "p-1 rounded hover:bg-foreground/10 transition text-muted-foreground hover:text-foreground",
          disabled && "opacity-40 pointer-events-none"
        )}
      >
        <AppIcon name="folder" width={13} />
      </button>

      {/* Image attach button */}
      <button
        onClick={() => imageInputRef.current?.click()}
        disabled={disabled}
        title="Attach image (vision)"
        className={cn(
          "p-1 rounded hover:bg-foreground/10 transition text-muted-foreground hover:text-foreground",
          disabled && "opacity-40 pointer-events-none"
        )}
      >
        <AppIcon name="canvas" width={13} />
      </button>

      {/* Attachment chips */}
      {attachments.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border",
            a.type === "image"
              ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
              : "border-blue-500/40 bg-blue-500/10 text-blue-300"
          )}
        >
          <span>{a.type === "image" ? "🖼" : "📄"}</span>
          <span className="max-w-[80px] truncate">{a.name}</span>
          <button
            onClick={() => onRemove(a.id)}
            className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-300 transition"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Convert attachments to message content parts for the API */
export function attachmentsToContent(
  textInput: string,
  attachments: Attachment[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (attachments.length === 0) return textInput

  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

  // Text part
  let fullText = textInput

  // Append file contents as text context
  const fileAttachments = attachments.filter((a) => a.type === "file")
  if (fileAttachments.length > 0) {
    fullText += "\n\n---\n" + fileAttachments.map((a) =>
      `**File: ${a.name}**\n\`\`\`\n${a.content.slice(0, 50_000)}\n\`\`\``
    ).join("\n\n")
  }

  if (fullText) parts.push({ type: "text", text: fullText })

  // Image parts
  for (const a of attachments.filter((att) => att.type === "image")) {
    parts.push({ type: "image_url", image_url: { url: a.content } })
  }

  return parts.length === 1 && parts[0].type === "text" ? parts[0].text! : parts
}
