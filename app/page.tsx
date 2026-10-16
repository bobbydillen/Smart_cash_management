import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import LoginPage from "@/components/login-page"

export default async function Home() {
  const user = await getSession()

  if (user) {
    if (user.role === "admin") redirect("/admin")
    if (user.role === "supervisor") redirect("/supervisor")
    if (user.role === "purchase") redirect("/purchase")
    redirect("/counter")
  }

  return <LoginPage />
}
