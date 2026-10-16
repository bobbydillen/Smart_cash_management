import type { ReactNode } from "react"
import { requirePurchaseViewer } from "@/lib/purchase-access"
import PurchaseShell from "@/components/purchase/shell"

export default async function PurchaseLayout({ children }: { children: ReactNode }) {
  const { role } = await requirePurchaseViewer()
  return <PurchaseShell role={role}>{children}</PurchaseShell>
}
