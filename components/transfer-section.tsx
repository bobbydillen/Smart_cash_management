"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRightLeft, Send } from "lucide-react"
import { todayIST } from "@/lib/report"
import SectionHeader from "@/components/section-header"
import StatusChip from "@/components/status-chip"
import {
  cancelTransfer,
  createTransfer,
  getMyTransfers,
  getTransferTargets,
  type Transfer,
} from "@/app/actions/transfer"

const STATUS_TONE: Record<Transfer["status"], "warning" | "success" | "neutral"> = {
  pending: "warning",
  accepted: "success",
  cancelled: "neutral",
}

const STATUS_LABEL: Record<Transfer["status"], string> = {
  pending: "Waiting for receiver",
  accepted: "Received",
  cancelled: "Cancelled",
}

export default function TransferSection ( {
  isReadOnly,
  refreshEntry,
  date,
  embedded = false,
}: {
  embedded?: boolean
  isReadOnly: boolean
  refreshEntry: () => Promise<void>
  /** the day being looked at; leave out for today */
  date?: string
} )
{
  const [ targets, setTargets ] = useState<string[]>( [] )
  const [ outgoing, setOutgoing ] = useState<Transfer[]>( [] )
  const [ to, setTo ] = useState( "" )
  const [ amount, setAmount ] = useState( "" )
  const [ note, setNote ] = useState( "" )
  const [ error, setError ] = useState( "" )
  const [ busy, setBusy ] = useState( false )

  const load = useCallback( async () =>
  {
    const res = await getMyTransfers( date )
    setOutgoing( res.outgoing )
  }, [ date ] )

  useEffect( () =>
  {
    getTransferTargets().then( setTargets )
    load()
  }, [ load ] )

  const isToday = !date || date === todayIST()
  const amt = Number( amount )
  const canSend = !isReadOnly && !busy && !!to && amt > 0

  const handleSend = async () =>
  {
    if ( !confirm( `Transfer ₹${ amt.toFixed( 2 ) } to ${ to }?` ) ) return
    setError( "" )
    setBusy( true )
    const res = await createTransfer( to, amt, note )
    setBusy( false )
    if ( res.error ) return setError( res.error )
    setAmount( "" )
    setNote( "" )
    setTo( "" )
    await Promise.all( [ load(), refreshEntry() ] )
  }

  const handleCancel = async ( id: string ) =>
  {
    if ( !confirm( "Cancel this transfer? The cash goes back to your drawer." ) ) return
    const res = await cancelTransfer( id )
    if ( res.error ) return alert( res.error )
    await Promise.all( [ load(), refreshEntry() ] )
  }

  const Wrap = embedded ? "div" : Card
  return (
    <Wrap className={ embedded ? "" : "p-5" }>
      { !embedded && (
        <SectionHeader
          icon={ <ArrowRightLeft className="size-4" /> }
          title="Transfer cash"
          subtitle="Send cash to another counter or the admin. It leaves your drawer now and is added to theirs when they accept."
        />
      ) }
      { embedded && (
        <p className="text-sm text-muted-foreground">
          It leaves your drawer now and is added to theirs when they accept.
        </p>
      ) }

      { !isReadOnly && (
        <div className="mt-4 space-y-3 rounded-xl bg-secondary/60 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
            <select
              value={ to }
              onChange={ ( e ) => setTo( e.target.value ) }
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option value="">Transfer to…</option>
              { targets.map( ( t ) => (
                <option key={ t } value={ t }>
                  { t }
                </option>
              ) ) }
            </select>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={ amount }
                onChange={ ( e ) => setAmount( e.target.value ) }
                className="pl-7"
              />
            </div>
          </div>

          <Input
            placeholder="Note (optional)"
            value={ note }
            maxLength={ 200 }
            onChange={ ( e ) => setNote( e.target.value ) }
          />

          <Button className="w-full" onClick={ handleSend } disabled={ !canSend }>
            <Send />
            { busy ? "Sending…" : "Send transfer" }
          </Button>
          { error && <p className="text-sm text-danger">{ error }</p> }
        </div>
      ) }

      { outgoing.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            { isToday ? "Sent today" : "Sent on this day" }
          </div>
          <div className="space-y-2">
            { outgoing.map( ( t ) => (
              <div
                key={ t._id }
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    ₹{ t.amount.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    { t.to }
                  </div>
                  <div className="text-xs text-muted-foreground">
                    { new Date( t.createdAt ).toLocaleTimeString( "en-IN", { hour: "2-digit", minute: "2-digit" } ) }
                    { t.note && ` · ${ t.note }` }
                  </div>
                </div>
                <StatusChip tone={ STATUS_TONE[ t.status ] }>{ STATUS_LABEL[ t.status ] }</StatusChip>
                { t.status === "pending" && !isReadOnly && (
                  <Button size="sm" variant="outline" onClick={ () => handleCancel( t._id ) }>
                    Cancel
                  </Button>
                ) }
              </div>
            ) ) }
          </div>
        </div>
      ) }
    </Wrap>
  )
}
