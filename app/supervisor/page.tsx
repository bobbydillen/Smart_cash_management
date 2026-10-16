import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getAllEntries, getCounterNames } from "@/app/actions/admin"
import AdminDashboard from "@/components/admin-dashboard"

/**
 * Supervisor page: the admin dashboard in read-only mode.
 */
export default async function SupervisorPage() {
  const user = await getSerializedSession()

  if (!user) redirect("/")
  if (user.role !== "supervisor") redirect("/")

  const [entries, counterNames] = await Promise.all([getAllEntries(), getCounterNames()])

  return <AdminDashboard initialEntries={entries} counterNames={counterNames} variant="supervisor" />
}
