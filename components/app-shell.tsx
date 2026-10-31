"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { LogOut, Lock, MoreHorizontal } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Modal from "@/components/modal"
import ThemeToggle from "@/components/theme-toggle"

/**
 * The frame every signed-in screen sits in (direction "Framed sheet"):
 * a tinted frame holding the sidebar, with the work on one white sheet.
 * On a phone the sidebar becomes a bar of tabs at the bottom (extra items go behind "More").
 */

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  active?: boolean
  /** a route, or leave out and pass onSelect for in-page steps */
  href?: string
  onSelect?: () => void
  disabled?: boolean
  /** shown next to a disabled item to say why it is locked */
  hint?: string
}

function NavEntry({ item, variant, onNavigate }: { item: NavItem; variant: "side" | "tab" | "sheet"; onNavigate?: () => void }) {
  const Icon = item.icon
  const base =
    variant === "side"
      ? "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm"
      : variant === "sheet"
        ? "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base"
        : "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs"
  const state = item.disabled
    ? "cursor-not-allowed text-muted-foreground/70"
    : item.active
      ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
  const content = (
    <>
      <Icon className={variant === "tab" ? "size-5" : "size-4"} aria-hidden />
      <span className={variant === "tab" ? "max-w-full truncate" : "flex-1 truncate text-left"}>{item.label}</span>
      {item.disabled && variant !== "tab" && <Lock className="size-3.5" aria-label="Locked" />}
    </>
  )
  const common = {
    className: `${base} ${state} transition-colors`,
    "aria-current": item.active ? (item.href ? ("page" as const) : ("step" as const)) : undefined,
    title: item.disabled ? item.hint : undefined,
  }
  if (item.href && !item.disabled)
    return (
      <Link href={item.href} onClick={onNavigate} {...common}>
        {content}
      </Link>
    )
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect?.()
        onNavigate?.()
      }}
      {...common}
    >
      {content}
    </button>
  )
}

export function AppShell({
  brand = { name: "Smart Cash", sub: "Smart Mart & Smart Fashions" },
  nav,
  secondary = [],
  sidebarExtra,
  user,
  title,
  subtitle,
  headerRight,
  toolbar,
  children,
  hasBottomBar = false,
  width = "max-w-4xl",
}: {
  brand?: { name: string; sub?: string }
  /** the main destinations: sidebar items on a computer, tabs on a phone (up to 4, the rest go behind More) */
  nav: NavItem[]
  /** less used destinations: lower in the sidebar, behind More on a phone */
  secondary?: NavItem[]
  /** extra controls for the sidebar (for example "Transfer cash") */
  sidebarExtra?: ReactNode
  user?: { name: string; role: string; onLogout: () => void }
  title: string
  subtitle?: string
  headerRight?: ReactNode
  /** a row under the header that scrolls away (date picker, quick actions) */
  toolbar?: ReactNode
  children: ReactNode
  /** reserve room for a ShellBar at the bottom */
  hasBottomBar?: boolean
  width?: string
}) {
  const [more, setMore] = useState(false)
  const needMore = true
  const tabs = nav.length > 4 ? nav.slice(0, 3) : nav
  const overflow = [...(nav.length > 4 ? nav.slice(3) : []), ...secondary]

  return (
    <div className="min-h-dvh bg-secondary text-foreground md:flex print:block print:bg-white">
      <a href="#main" className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* ---------- sidebar (computers) ---------- */}
      <aside className="sticky top-0 hidden h-dvh print:!hidden w-[var(--sidebar-w)] shrink-0 flex-col gap-1 p-3 md:flex">
        <div className="mb-3 flex items-center gap-2.5 px-1 pt-1">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-xs font-bold text-background" aria-hidden>
            SC
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{brand.name}</p>
            {brand.sub && <p className="truncate text-xs text-muted-foreground">{brand.sub}</p>}
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavEntry key={n.id} item={n} variant="side" />
          ))}
        </nav>
        {secondary.length > 0 && (
          <nav aria-label="More" className="mt-4 flex flex-col gap-1 border-t pt-3">
            {secondary.map((n) => (
              <NavEntry key={n.id} item={n} variant="side" />
            ))}
          </nav>
        )}
        {sidebarExtra && <div className="mt-3 space-y-2">{sidebarExtra}</div>}
        <div className="mt-auto space-y-2 pt-3">
          <ThemeToggle />
          {user && (
            <div className="flex items-center gap-2 rounded-lg px-1 py-1">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-xs font-semibold shadow-[0_0_0_1px_var(--border)]" aria-hidden>
                {user.name.replace(/^Smart /, "").charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
              <button type="button" onClick={user.onLogout} aria-label="Log out" title="Log out" className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ---------- the white sheet ---------- */}
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:min-h-0 md:p-2 md:pl-0 print:p-0">
        <div className="flex min-h-0 flex-1 flex-col bg-card md:rounded-2xl md:border print:border-0">
          <header className="sticky top-0 z-20 flex items-center print:hidden gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur md:rounded-t-2xl md:px-6">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {headerRight}
          </header>
          {toolbar && <section aria-label="Date and actions" className="border-b px-4 py-2 md:px-6 print:hidden">{toolbar}</section>}
          <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-4 py-5 outline-none md:px-6 ${width} ${hasBottomBar ? "pb-40 md:pb-28" : "pb-28 md:pb-8"}`}>
            {children}
          </main>
        </div>
      </div>

      {/* ---------- tabs (phones) ---------- */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--tabs-h)] print:hidden gap-1 border-t bg-secondary px-2 pt-1 pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((n) => (
          <NavEntry key={n.id} item={n} variant="tab" />
        ))}
        {needMore && (
          <button type="button" onClick={() => setMore(true)} className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs text-muted-foreground hover:bg-card/70">
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </button>
        )}
      </nav>
      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div className="space-y-1">
            {overflow.map((n) => (
              <NavEntry key={n.id} item={n} variant="sheet" onNavigate={() => setMore(false)} />
            ))}
            {sidebarExtra && <div className="space-y-2 pt-2">{sidebarExtra}</div>}
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <ThemeToggle />
              {user && (
                <button type="button" onClick={user.onLogout} className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft">
                  <LogOut className="size-4" aria-hidden /> Log out
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** A bar fixed to the bottom of the sheet (running totals, the submit button). It sits above the phone tabs. */
export function ShellBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[var(--tabs-h)] z-30 border-t bg-card md:bottom-2 md:left-[var(--sidebar-w)] md:right-2 md:rounded-b-2xl md:border-x md:border-b">
      <div className="mx-auto w-full max-w-4xl px-4 py-3 md:px-6">{children}</div>
    </div>
  )
}
