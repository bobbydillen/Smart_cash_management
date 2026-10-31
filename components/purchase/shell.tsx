"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarCheck, Landmark, Ticket, TrendingUp, Truck } from "lucide-react"
import { logout } from "@/app/actions/auth"
import { AppShell, type NavItem } from "@/components/app-shell"
import { adminNav } from "@/components/admin-nav"

const SECTIONS = [
  { href: "/purchase", label: "Today", exact: true, icon: CalendarCheck },
  { href: "/purchase/vendors", label: "Vendors", icon: Truck },
  { href: "/purchase/cheques", label: "Cheques", icon: Landmark },
  { href: "/purchase/vouchers", label: "Vouchers", icon: Ticket },
  { href: "/purchase/reports", label: "Reports", icon: TrendingUp },
]

/** The frame for every purchase page. The purchase counter navigates its own sections; the admin keeps the admin navigation. */
export default function PurchaseShell({
  role,
  children,
}: {
  role: "purchase" | "admin" | "supervisor"
  children: ReactNode
}) {
  const pathname = usePathname()
  const isActive = (t: (typeof SECTIONS)[number]) => (t.exact ? pathname === t.href : pathname.startsWith(t.href))
  const current = SECTIONS.find(isActive) ?? SECTIONS[0]

  const own: NavItem[] = SECTIONS.map((t) => ({ id: t.href, label: t.label, icon: t.icon, href: t.href, active: isActive(t) }))
  const admin = adminNav(pathname.startsWith("/purchase/cheques") ? "cheques" : "purchase", role === "admin")

  return (
    <AppShell
      brand={{ name: "Smart Cash", sub: "Purchase counter" }}
      nav={role === "purchase" ? own : admin.nav}
      secondary={role === "purchase" ? [] : admin.secondary}
      user={
        role === "purchase"
          ? { name: "Purchase", role: "Purchase counter", onLogout: () => logout() }
          : { name: role === "admin" ? "Admin" : "Supervisor", role: role === "admin" ? "Admin" : "Supervisor (read-only)", onLogout: () => logout() }
      }
      title={current.label}
      subtitle={role === "purchase" ? "Purchase counter" : `Purchase · viewing as ${role}`}
      width="max-w-4xl"
      toolbar={
        role === "purchase" ? undefined : (
          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Purchase sections">
            {SECTIONS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={isActive(t) ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${isActive(t) ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )
      }
    >
      <div className="space-y-5">{children}</div>
    </AppShell>
  )
}
