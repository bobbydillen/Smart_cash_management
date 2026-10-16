import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getTodayEntry } from "@/app/actions/counter"
import CounterDashboard from "@/components/counter-dashboard"

export default async function CounterPage ()
{
  const user = await getSerializedSession()

  // 🔐 must be logged in
  if ( !user )
  {
    redirect( "/" )
  }

  // 🔐 ONLY counter can access /counter
  if ( user.role !== "counter" )
  {
    redirect( "/" )
  }

  // 📦 fetch today's entry
  const entry = await getTodayEntry()

  return (
    <CounterDashboard
      user={ user }
      initialEntry={ entry }
    />
  )
}
