import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Tone = "success" | "warning" | "info" | "danger" | "neutral"

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
}

const DOTS: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  neutral: "bg-muted-foreground",
}

/** Small rounded status label. Always carries words, never colour alone. */
export default function StatusChip({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        TONES[tone],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  )
}
