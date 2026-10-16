"use client"

import { Loader2, Check, AlertCircle } from "lucide-react"
import type { SaveStatus } from "@/hooks/use-autosave"

export default function SaveIndicator ( {
  status,
  error,
  onRetry,
}: {
  status: SaveStatus
  error: string
  onRetry: () => void
} )
{
  if ( status === "saving" )
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
      </span>
    )
  if ( status === "unsaved" )
    return <span className="text-xs text-muted-foreground">Unsaved changes…</span>
  if ( status === "saved" )
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
        <Check className="w-3.5 h-3.5" /> Saved successfully
      </span>
    )
  if ( status === "error" )
    return (
      <span className="flex items-center gap-2 text-xs text-red-600 font-medium">
        <AlertCircle className="w-3.5 h-3.5" />
        Could not save{ error ? `: ${ error }` : "" }
        <button className="underline" onClick={ onRetry }>
          Retry
        </button>
      </span>
    )
  return (
    <span className="text-xs text-muted-foreground">Changes save automatically</span>
  )
}

/* ================= COMPONENT ================= */
