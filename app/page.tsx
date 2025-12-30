import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import LoginPage from "@/components/login-page"

export default async function Home() {
  const user = await getSession()

  if (user) {
    if (user.role === "admin") {
      redirect("/admin")
    } else {
      redirect("/counter")
    }
  }

  return <LoginPage />
}
