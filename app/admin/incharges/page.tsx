import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getAllIncharges } from "@/app/actions/incharge"
import InchargeManagement from "@/components/incharge-management"

export default async function InchargesPage() {
  const user = await getSerializedSession()

  if (!user) redirect("/")
  if (user.role !== "admin") redirect("/counter")

  const incharges = await getAllIncharges()

  return <InchargeManagement initialIncharges={incharges} />
}
