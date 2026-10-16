"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Shared frame for the smaller admin pages: sticky header with a back button, centred content. */
export default function PageShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  right,
  children,
  width = "max-w-3xl",
}: {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  right?: ReactNode
  children: ReactNode
  width?: string
}) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className={`mx-auto flex w-full items-center gap-3 px-4 py-3 ${width}`}>
          {backHref && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push(backHref)}
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {right}
        </div>
      </header>

      <main className={`mx-auto w-full space-y-5 px-4 py-5 ${width}`}>{children}</main>
    </div>
  )
}
