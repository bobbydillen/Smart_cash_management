import type { ReactNode } from "react"

/** Title row used at the top of a card: heading, optional help text, optional right-hand slot. */
export default function SectionHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
