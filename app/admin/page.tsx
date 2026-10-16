import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getAllEntries, getCounterNames } from "@/app/actions/admin"
import AdminDashboard from "@/components/admin-dashboard"

export default async function AdminPage() {
  const user = await getSerializedSession()

  if (!user) {
    redirect("/")
  }

  if (user.role !== "admin") {
    redirect("/")
  }

  const [entries, counterNames] = await Promise.all([getAllEntries(), getCounterNames()])

  return <AdminDashboard initialEntries={entries} counterNames={counterNames} />
}
