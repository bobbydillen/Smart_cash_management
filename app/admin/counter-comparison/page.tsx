import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import ComparisonReport from "@/components/comparison-report"

export default async function CounterComparisonPage() {
  const user = await getSerializedSession()

  if (!user || (user.role !== "admin" && user.role !== "supervisor")) {
    redirect("/")
  }

  return (
    <ComparisonReport
      backHref={user.role === "supervisor" ? "/supervisor" : "/admin"}
    />
  )
}
