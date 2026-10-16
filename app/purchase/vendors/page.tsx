import { requirePurchaseViewer } from "@/lib/purchase-access"
import { listVendors } from "@/lib/purchase-service"
import VendorsView from "@/components/purchase/vendors-view"

export default async function VendorsPage() {
  const { db, role } = await requirePurchaseViewer()
  return <VendorsView vendors={await listVendors(db)} role={role} />
}
