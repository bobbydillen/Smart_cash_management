import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getAllEntries } from "@/app/actions/admin"
import AdminDashboard from "@/components/admin-dashboard"

export default async function AdminPage() {
  const user = await getSerializedSession()

  if (!user) {
    redirect("/")
  }

  if (user.role !== "admin") {
    redirect("/counter")
  }

  const entries = await getAllEntries()

  return <AdminDashboard user={user} initialEntries={entries} />
}
