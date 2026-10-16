"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { HandCoins } from "lucide-react"
import {
  acceptTransfer,
  getMyTransfers,
  type Transfer,
} from "@/app/actions/transfer"

/**
 * Shown at the top of the counter page whenever another counter has sent
 * cash that this counter has not accepted yet.
 */
export default function IncomingTransfersBanner ( {
  canAccept,
  refreshEntry,
}: {
  /** false until the opening cash is verified and while the day is open */
  canAccept: boolean
  refreshEntry: () => Promise<void>
} )
{
  const [ pending, setPending ] = useState<Transfer[]>( [] )
  const [ busyId, setBusyId ] = useState<string | null>( null )
  const [ error, setError ] = useState( "" )

  const load = useCallback( async () =>
  {
    const res = await getMyTransfers()
    setPending( res.incoming.filter( ( t ) => t.status === "pending" ) )
  }, [] )

  useEffect( () =>
  {
    load()
    const timer = setInterval( load, 30000 )
    return () => clearInterval( timer )
  }, [ load ] )

  const handleAccept = async ( t: Transfer ) =>
  {
    if (
      !confirm(
        `Have you received ₹${ t.amount.toFixed( 2 ) } from ${ t.from }? It will be added to your cash.`
      )
    )
      return
    setError( "" )
    setBusyId( t._id )
    const res = await acceptTransfer( t._id )
    setBusyId( null )
    if ( res.error ) setError( res.error )
    await Promise.all( [ load(), refreshEntry() ] )
  }

  if ( pending.length === 0 ) return null

  return (
    <div className="space-y-3 rounded-2xl border border-info/30 bg-info-soft p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-info">
        <HandCoins className="size-5" />
        Cash transferred to you
      </div>

      { pending.map( ( t ) => (
        <div
          key={ t._id }
          className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 shadow-sm"
        >
          <div className="min-w-48 flex-1">
            <div className="text-sm font-semibold">
              ₹{ t.amount.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
              <span className="font-normal text-muted-foreground"> from </span>
              { t.from }
            </div>
            <div className="text-xs text-muted-foreground">
              { new Date( t.createdAt ).toLocaleTimeString( "en-IN", { hour: "2-digit", minute: "2-digit" } ) }
              { t.note && ` · ${ t.note }` }
            </div>
          </div>
          <Button
            size="sm"
            disabled={ !canAccept || busyId === t._id }
            onClick={ () => handleAccept( t ) }
          >
            { busyId === t._id ? "Accepting…" : "Accept cash" }
          </Button>
        </div>
      ) ) }

      { !canAccept && (
        <p className="text-xs text-info">
          Verify your opening cash first, then you can accept.
        </p>
      ) }
      { error && <p className="text-sm text-danger">{ error }</p> }
    </div>
  )
}
