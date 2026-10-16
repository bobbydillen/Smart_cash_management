import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getDatabase } from "@/lib/mongodb"

export type PurchaseRole = "purchase" | "admin" | "supervisor"

/**
 * The purchase pages can be opened by the purchase counter (who records things)
 * and by the admin and supervisor (who only look, plus the admin confirms days).
 * Anyone else is sent back to the sign-in page.
 */
export async function requirePurchaseViewer() {
  const user = await getSession()
  if (!user || (user.role !== "purchase" && user.role !== "admin" && user.role !== "supervisor")) {
    redirect("/")
  }
  return { db: await getDatabase(), role: user.role as PurchaseRole }
}
