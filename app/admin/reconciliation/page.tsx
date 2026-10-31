import { redirect } from "next/navigation"
import { getSerializedSession } from "@/lib/session"
import { makeReconToken } from "@/lib/recon-token"
import ReconciliationPage from "@/components/reconciliation/reconciliation-page"

/** Admin only. The token lets the page call the reconciliation engine (api/recon.py). */
export default async function Page() {
  const user = await getSerializedSession()
  if (!user || user.role !== "admin") redirect("/")
  return <ReconciliationPage token={makeReconToken()} />
}
