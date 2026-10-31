"use client"

import type { ReactNode } from "react"
import { logout } from "@/app/actions/auth"
import { AppShell } from "@/components/app-shell"
import { adminNav, type AdminPage } from "@/components/admin-nav"

/** Frame for the admin's pages (in-charges, passwords, reconciliation): the shared shell with the admin navigation. */
export default function PageShell({
  page,
  title,
  subtitle,
  right,
  children,
  width = "max-w-3xl",
  hasBottomBar = false,
}: {
  page: AdminPage
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  width?: string
  hasBottomBar?: boolean
}) {
  const { nav, secondary } = adminNav(page)
  return (
    <AppShell
      nav={nav}
      secondary={secondary}
      user={{ name: "Admin", role: "Admin", onLogout: () => logout() }}
      title={title}
      subtitle={subtitle}
      headerRight={right}
      width={width}
      hasBottomBar={hasBottomBar}
    >
      <div className="space-y-5">{children}</div>
    </AppShell>
  )
}
