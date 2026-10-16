"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/** A sheet that slides up on phones and sits centred on larger screens. */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  // Esc closes, and the page behind does not scroll while the sheet is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
