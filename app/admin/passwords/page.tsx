import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getAllUsers } from "@/app/actions/password"
import PasswordManagement from "@/components/password-management"

export default async function PasswordsPage() {
  const user = await getSerializedSession()

  if (!user) {
    redirect("/")
  }

  if (user.role !== "admin") {
    redirect("/counter")
  }

  const result = await getAllUsers()

  if ("error" in result) {
    redirect("/admin")
  }

  return <PasswordManagement adminUser={user} users={result.users} />
}
