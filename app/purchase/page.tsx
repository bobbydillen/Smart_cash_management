import { requirePurchaseViewer } from "@/lib/purchase-access"
import { getDayView, listVendors } from "@/lib/purchase-service"
import { isDateString } from "@/lib/validation"
import { todayIST } from "@/lib/report"
import TodayView from "@/components/purchase/today-view"

export default async function PurchaseTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { db, role } = await requirePurchaseViewer()
  const params = await searchParams
  const today = todayIST()

  // anyone can look at an earlier day; only today can be changed
  const date = isDateString(params.date) && params.date <= today ? params.date : today

  const [view, vendors] = await Promise.all([
    // opening the page is what starts the purchase counter's day
    getDayView(db, date, role === "purchase" && date === today),
    listVendors(db),
  ])

  return <TodayView key={date} view={view} vendors={vendors} role={role} date={date} today={today} />
}
