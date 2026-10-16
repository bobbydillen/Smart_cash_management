import type React from "react"

export function Notice ( {
  tone,
  children,
}: {
  tone: "danger" | "warning"
  children: React.ReactNode
} )
{
  return (
    <div
      className={ `mt-3 rounded-lg px-3 py-2 text-sm ${ tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
        }` }
    >
      { children }
    </div>
  )
}
