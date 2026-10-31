"use client"

import { useEffect, useRef, type ReactNode } from "react"
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
  const panel = useRef<HTMLDivElement>(null)
  // always call the latest onClose without re-running the effect below on every render
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Esc closes, the page behind does not scroll, keyboard focus moves into the sheet,
  // stays inside it, and goes back to where it was when the sheet closes
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null)

    // start on the first field (not the close button); fall back to the sheet itself
    const first = focusable().find((el) => !el.hasAttribute("data-modal-close"))
    ;(first ?? panel.current)?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current()
      if (e.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return e.preventDefault()
      const a = items[0]
      const z = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === a || document.activeElement === panel.current)) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
      opener?.focus?.({ preventScroll: true })
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in fade-in-0 items-end justify-center bg-black/40 duration-200 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={`max-h-[94vh] w-full animate-in overflow-y-auto fade-in-0 slide-in-from-bottom-4 outline-none duration-200 sm:zoom-in-95 sm:slide-in-from-bottom-0 rounded-t-3xl bg-background shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" data-modal-close>
            <X />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
