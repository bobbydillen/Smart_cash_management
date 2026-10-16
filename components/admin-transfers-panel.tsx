"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRightLeft, RefreshCw } from "lucide-react"
import {
  acknowledgeTransfer,
  getTransfersForDate,
  type Transfer,
} from "@/app/actions/transfer"
import SectionHeader from "./section-header"
import StatusChip from "./status-chip"

const LABEL: Record<Transfer["status"], string> = {
  pending: "Pending",
  accepted: "Received",
  cancelled: "Cancelled",
}
const TONE: Record<Transfer["status"], "warning" | "success" | "neutral"> = {
  pending: "warning",
  accepted: "success",
  cancelled: "neutral",
}

export default function AdminTransfersPanel ( {
  date,
  canAcknowledge,
}: {
  date: string
  canAcknowledge: boolean
} )
{
  const [ transfers, setTransfers ] = useState<Transfer[]>( [] )

  const load = useCallback(
    async () => setTransfers( await getTransfersForDate( date ) ),
    [ date ]
  )

  useEffect( () =>
  {
    load()
  }, [ load ] )

  const handleAck = async ( id: string ) =>
  {
    if ( !confirm( "Confirm you have received this cash?" ) ) return
    const res = await acknowledgeTransfer( id )
    if ( res.error ) alert( res.error )
    await load()
  }

  if ( transfers.length === 0 ) return null

  return (
    <Card className="p-5">
      <SectionHeader
        icon={ <ArrowRightLeft className="size-4" /> }
        title="Cash transfers"
        subtitle="Cash moved between counters and to admin"
        right={
          <Button size="icon" variant="ghost" onClick={ load } aria-label="Refresh" title="Refresh">
            <RefreshCw />
          </Button>
        }
      />

      <div className="mt-3 divide-y">
        { transfers.map( ( t ) => (
          <div key={ t._id } className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                ₹{ t.amount.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
                <span className="mx-1.5 text-muted-foreground">·</span>
                { t.from }
                <span className="mx-1.5 text-muted-foreground">→</span>
                { t.to }
              </div>
              <div className="text-xs text-muted-foreground">
                { t.date }{ " " }
                { new Date( t.createdAt ).toLocaleTimeString( "en-IN", { hour: "2-digit", minute: "2-digit" } ) }
                { t.note && ` · ${ t.note }` }
                { t.resolvedBy && ` · by ${ t.resolvedBy }` }
              </div>
            </div>
            <StatusChip tone={ TONE[ t.status ] }>{ LABEL[ t.status ] }</StatusChip>
            { canAcknowledge && t.status === "pending" && t.to === "Admin" && (
              <Button size="sm" onClick={ () => handleAck( t._id ) }>
                Mark received
              </Button>
            ) }
          </div>
        ) ) }
      </div>
    </Card>
  )
}
