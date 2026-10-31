import type { ReactNode } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, Check, CircleDashed, Clock, Lock } from "lucide-react"
import { inr, type Status } from "./data"

/** Tabular, right-aligned-friendly money. */
export const Money = ({ n, d = 0, className = "" }: { n: number; d?: number; className?: string }) => (
  <span className={`tabular-nums ${className}`}>{inr(n, d)}</span>
)

/** Shortage / excess / balanced: icon + word + colour, never colour alone. */
export function Diff({ value, open = false, size = "sm" }: { value: number | null; open?: boolean; size?: "sm" | "lg" }) {
  const text = size === "lg" ? "text-base" : "text-sm"
  if (value === null || open)
    return (
      <span className={`inline-flex items-center gap-1.5 text-muted-foreground ${text}`}>
        <CircleDashed className="size-4" aria-hidden /> Not counted yet
      </span>
    )
  if (Math.abs(value) < 0.005)
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium text-success ${text}`}>
        <Check className="size-4" aria-hidden /> Balanced
      </span>
    )
  return value > 0 ? (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-danger ${text}`}>
      <ArrowDown className="size-4" aria-hidden /> Short <span className="tabular-nums">{inr(value)}</span>
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-info ${text}`}>
      <ArrowUp className="size-4" aria-hidden /> Excess <span className="tabular-nums">{inr(-value)}</span>
    </span>
  )
}

const STATUS: Record<Status, { label: string; cls: string; icon: ReactNode }> = {
  open: { label: "Open", cls: "bg-info-soft text-info", icon: <Clock className="size-3.5" aria-hidden /> },
  submitted: { label: "Waiting for you", cls: "bg-warning-soft text-warning", icon: <AlertTriangle className="size-3.5" aria-hidden /> },
  confirmed: { label: "Confirmed", cls: "bg-success-soft text-success", icon: <Check className="size-3.5" aria-hidden /> },
}

export const StatusPill = ({ status, label }: { status: Status; label?: string }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[status].cls}`}>
    {STATUS[status].icon}
    {label ?? STATUS[status].label}
  </span>
)

export const Pill = ({ tone, children }: { tone: "success" | "info" | "warning" | "neutral"; children: ReactNode }) => {
  const cls = {
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-secondary text-muted-foreground",
  }[tone]
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>
}

export const LockedNote = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
    <Lock className="size-3.5" aria-hidden /> {children}
  </span>
)

/** 44 px stepper button used by every direction's counting rows */
export const StepBtn = ({ children, label }: { children: ReactNode; label: string }) => (
  <button type="button" aria-label={label} className="grid size-11 shrink-0 place-items-center rounded-lg border bg-card text-foreground transition-colors hover:bg-secondary">
    {children}
  </button>
)
