import { requirePurchaseViewer } from "@/lib/purchase-access"
import { listVouchers } from "@/lib/purchase-service"
import VouchersView from "@/components/purchase/vouchers-view"

export default async function VouchersPage() {
  const { db, role } = await requirePurchaseViewer()
  return <VouchersView vouchers={await listVouchers(db)} role={role} />
}
