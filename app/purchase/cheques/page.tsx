import { requirePurchaseViewer } from "@/lib/purchase-access"
import { listBanks, listCheques } from "@/lib/purchase-service"
import ChequesView from "@/components/purchase/cheques-view"

export default async function ChequesPage() {
  const { db, role } = await requirePurchaseViewer()
  const [cheques, banks] = await Promise.all([listCheques(db), listBanks(db)])
  return <ChequesView cheques={cheques} role={role} banks={banks} />
}
