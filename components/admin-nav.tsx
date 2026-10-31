import { BarChart3, FileSearch, KeyRound, Landmark, LayoutGrid, PackageSearch, Users } from "lucide-react"
import type { NavItem } from "./app-shell"

export type AdminPage = "overview" | "reports" | "purchase" | "reconciliation" | "cheques" | "incharges" | "passwords"

/**
 * The admin's navigation, shared by every admin page.
 * The supervisor sees the same screens read-only, without the admin-only ones.
 */
export function adminNav(active: AdminPage, isAdmin = true): { nav: NavItem[]; secondary: NavItem[] } {
  const nav: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid, href: isAdmin ? "/admin" : "/supervisor" },
    { id: "reports", label: "Reports", icon: BarChart3, href: "/admin/counter-comparison" },
    { id: "purchase", label: "Purchase", icon: PackageSearch, href: "/purchase" },
    ...(isAdmin ? [{ id: "reconciliation", label: "Reconciliation", icon: FileSearch, href: "/admin/reconciliation" }] : []),
  ]
  const secondary: NavItem[] = isAdmin
    ? [
        { id: "cheques", label: "Cheques & banks", icon: Landmark, href: "/purchase/cheques" },
        { id: "incharges", label: "In-charges", icon: Users, href: "/admin/incharges" },
        { id: "passwords", label: "Passwords", icon: KeyRound, href: "/admin/passwords" },
      ]
    : []
  return {
    nav: nav.map((n) => ({ ...n, active: n.id === active })),
    secondary: secondary.map((n) => ({ ...n, active: n.id === active })),
  }
}
