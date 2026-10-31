import { ArrowDown, ArrowUp, Check, CircleDashed } from "lucide-react"
import { inr } from "@/lib/report"

/**
 * Shortage / excess / balanced, always as an icon + a word + a colour (never colour alone).
 * `shortage` is expected minus counted: positive = short, negative = excess, null = not counted yet.
 */
export default function DiffText({ shortage, className = "text-sm" }: { shortage: number | null; className?: string }) {
  if (shortage === null)
    return (
      <span className={`inline-flex items-center gap-1.5 text-muted-foreground ${className}`}>
        <CircleDashed className="size-4 shrink-0" aria-hidden /> Not submitted yet
      </span>
    )
  if (Math.abs(shortage) < 0.005)
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium text-success ${className}`}>
        <Check className="size-4 shrink-0" aria-hidden /> Balanced
      </span>
    )
  return shortage > 0 ? (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-danger ${className}`}>
      <ArrowDown className="size-4 shrink-0" aria-hidden /> Short <span className="tabular-nums">₹{inr(shortage)}</span>
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-info ${className}`}>
      <ArrowUp className="size-4 shrink-0" aria-hidden /> Excess <span className="tabular-nums">₹{inr(-shortage)}</span>
    </span>
  )
}
