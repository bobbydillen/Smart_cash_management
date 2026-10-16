"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, LogOut, PackageSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"

const TABS = [
  { href: "/purchase", label: "Today", exact: true },
  { href: "/purchase/vendors", label: "Vendors" },
  { href: "/purchase/cheques", label: "Cheques" },
  { href: "/purchase/vouchers", label: "Vouchers" },
  { href: "/purchase/reports", label: "Reports" },
]

/** Header and section tabs shared by every purchase page. */
export default function PurchaseShell({
  role,
  children,
}: {
  role: "purchase" | "admin" | "supervisor"
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const backHref = role === "admin" ? "/admin" : "/supervisor"

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto w-full max-w-4xl px-4">
          <div className="flex items-center gap-3 py-3">
            {role !== "purchase" && (
              <Button variant="outline" size="icon" onClick={() => router.push(backHref)} aria-label="Back to dashboard" title="Back to dashboard">
                <ArrowLeft />
              </Button>
            )}
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <PackageSearch className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold leading-tight">Purchase</h1>
              <p className="truncate text-xs text-muted-foreground">
                {role === "purchase" ? "Vendors, bills and payments" : "Viewing as " + role}
              </p>
            </div>
            {role === "purchase" && (
              <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Log out" title="Log out">
                <LogOut />
              </Button>
            )}
          </div>

          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-3" aria-label="Purchase sections">
            {TABS.map((t) => {
              const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 pb-16">{children}</main>
    </div>
  )
}
