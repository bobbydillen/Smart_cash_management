import SupervisorDashboard from "@/components/supervisor-dashboard"
import { getAllEntries } from "@/app/actions/admin"

/**
 * Supervisor Page
 * - Server Component
 * - Read-only access
 * - Uses same data source as admin
 */
export default async function SupervisorPage() {
  // Load today's entries by default
  const today = new Date().toISOString().split("T")[0]
  const initialEntries = await getAllEntries(today)

  return <SupervisorDashboard initialEntries={initialEntries} />
}
