import { notFound } from "next/navigation"
import { requirePurchaseViewer } from "@/lib/purchase-access"
import { getVendorDetail, listVendors } from "@/lib/purchase-service"
import VendorDetailView from "@/components/purchase/vendor-detail"

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, role } = await requirePurchaseViewer()
  const { id } = await params

  const [detail, vendors] = await Promise.all([getVendorDetail(db, id), listVendors(db)])
  if (!detail) notFound()

  return <VendorDetailView detail={detail} vendors={vendors} role={role} />
}
