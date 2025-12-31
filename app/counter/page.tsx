import { getSerializedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getTodayEntry } from "@/app/actions/counter"
import CounterDashboard from "@/components/counter-dashboard"

export default async function CounterPage ()
{
  const user = await getSerializedSession()

  if ( !user )
  {
    redirect( "/" )
  }

  if ( user.role !== "counter" )
  {
    redirect( "/admin" )
  }

  const entry = await getTodayEntry()

  return <CounterDashboard user={ user } initialEntry={ entry } />
}
