import { requirePurchaseViewer } from "@/lib/purchase-access"
import { listVendors } from "@/lib/purchase-service"
import ReportsView from "@/components/purchase/reports-view"

export default async function PurchaseReportsPage() {
  const { db } = await requirePurchaseViewer()
  return <ReportsView vendors={await listVendors(db)} />
}
