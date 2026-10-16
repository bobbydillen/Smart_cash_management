"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { DayEntry } from "@/lib/types"
import { AlertCircle, Pencil, ShieldCheck } from "lucide-react"
import SectionHeader from "@/components/section-header"
import { DENOMS, COIN_KEYS } from "@/lib/next-day"
import { inr as fmt } from "@/lib/report"
import StatusChip from "@/components/status-chip"
import { getActiveIncharges, type Incharge } from "@/app/actions/incharge"

interface OpeningVerifyPageProps
{
  entry: DayEntry
  isReadOnly: boolean
  /** true while the verify request is running */
  verifying?: boolean
  /** returns an error message, or null on success */
  onVerify: (
    verifiedBy: string,
    checked: string[],
    status: "verified" | "not_verified",
    note: string
  ) => Promise<string | null>
}

export default function OpeningVerifyPage ( {
  entry,
  isReadOnly,
  verifying = false,
  onVerify,
}: OpeningVerifyPageProps )
{
  const verified = !!entry.openingVerified
  const flagged = entry.openingVerifyStatus === "not_verified"
  const d = entry.openingDenominations
  const openingCash = entry.openingCash ?? 0

  // an already-verified day can be re-opened for correction until it is submitted
  const [ editing, setEditing ] = useState( false )
  const formMode = !verified || editing

  const [ incharges, setIncharges ] = useState<Incharge[]>( [] )
  const [ loadingNames, setLoadingNames ] = useState( true )
  const [ name, setName ] = useState( "" )
  const [ checked, setChecked ] = useState<string[]>( [] )
  const [ error, setError ] = useState( "" )
  const [ notVerifying, setNotVerifying ] = useState( false )
  const [ note, setNote ] = useState( "" )

  useEffect( () =>
  {
    if ( !formMode ) return
    getActiveIncharges().then( ( list ) =>
    {
      setIncharges( list )
      setLoadingNames( false )
    } )
  }, [ formMode ] )

  const startEdit = () =>
  {
    // pre-fill with what was saved so only the mistake needs fixing
    setName( entry.openingVerifiedBy || "" )
    setChecked( entry.openingCheckedDenoms || [] )
    setNote( entry.openingNote || "" )
    setNotVerifying( flagged )
    setError( "" )
    setEditing( true )
  }

  const cancelEdit = () =>
  {
    setEditing( false )
    setNotVerifying( false )
    setNote( "" )
    setError( "" )
  }

  // only rows that actually hold cash need a tick
  const rows = DENOMS.filter( ( [ , key ] ) => ( d?.[ key ] ?? 0 ) > 0 )
  const allChecked = rows.every( ( [ , key ] ) => checked.includes( key ) )
  const canVerify = !!name && allChecked && !isReadOnly && !verifying
  const canFlag = !!name && note.trim().length > 0 && !isReadOnly && !verifying

  const toggle = ( key: string ) =>
    setChecked( ( c ) =>
      c.includes( key ) ? c.filter( ( k ) => k !== key ) : [ ...c, key ]
    )

  const submit = async ( status: "verified" | "not_verified" ) =>
  {
    setError( "" )
    const err = await onVerify( name, checked, status, note )
    if ( err ) setError( err )
    else cancelEdit()
  }

  const isTicked = ( key: string ) =>
    !formMode
      // entries verified before ticks existed have no record: show all ticked
      ? ( entry.openingCheckedDenoms?.length ?? 0 ) === 0 ||
        entry.openingCheckedDenoms!.includes( key )
      : checked.includes( key )

  // keep the saved name selectable even if the admin later removed it from the list
  const nameOptions =
    name && !incharges.some( ( i ) => i.name === name )
      ? [ ...incharges.map( ( i ) => i.name ), name ]
      : incharges.map( ( i ) => i.name )

  return (
    <Card className="p-5">
      <SectionHeader
        icon={ <ShieldCheck className="size-4" /> }
        title="Opening cash verification"
        subtitle={
          editing
            ? "Correct the details and save again. The earlier entry is kept in the history."
            : verified
              ? flagged
                ? "The opening cash could not be verified for this day."
                : "This is the opening cash that was verified for this day."
              : "Count each denomination and tick it, choose who is verifying, then confirm. Nothing else can be entered until this is done."
        }
        right={
          verified && !editing ? (
            flagged ? (
              <StatusChip tone="warning">Flagged</StatusChip>
            ) : (
              <StatusChip tone="success">Verified</StatusChip>
            )
          ) : undefined
        }
      />

      <div className="mt-4 space-y-1.5">
        { DENOMS.map( ( [ label, key, value ] ) =>
        {
          const count = d?.[ key ] ?? 0
          if ( count <= 0 ) return null
          const ticked = isTicked( key )
          return (
            <label
              key={ key }
              className={ `flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${ ticked ? "border-success/30 bg-success-soft" : "bg-card"
                } ${ !formMode || isReadOnly ? "" : "cursor-pointer hover:bg-secondary/60" }` }
            >
              <Checkbox
                checked={ ticked }
                disabled={ !formMode || isReadOnly }
                onCheckedChange={ () => toggle( key ) }
                aria-label={ `Counted ${ label }` }
              />
              <span className="flex-1 text-sm">
                <span className="font-semibold">{ label }{ COIN_KEYS.includes( key as any ) ? " coin" : "" }</span>
                <span className="text-muted-foreground"> × { count }</span>
              </span>
              <span className="text-sm font-medium">₹{ fmt( count * value ) }</span>
            </label>
          )
        } ) }
        { rows.length === 0 && (
          <div className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            No denominations recorded for this opening.
          </div>
        ) }
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
        <span className="text-sm font-medium">Total opening cash</span>
        <span className="text-lg font-semibold">₹{ fmt( openingCash ) }</span>
      </div>

      { !formMode ? (
        <div className="mt-4 space-y-3">
          { flagged && (
            <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4" /> Opening cash NOT verified
              </div>
              <div className="mt-1">Reason: { entry.openingNote }</div>
            </div>
          ) }
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              By <strong className="text-foreground">{ entry.openingVerifiedBy || "—" }</strong>
              { entry.openingVerifiedAt && (
                <>
                  { " " }·{ " " }
                  { new Date( entry.openingVerifiedAt ).toLocaleString( "en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  } ) }
                </>
              ) }
              { ( entry.openingHistory?.length ?? 0 ) > 0 && (
                <> · edited { entry.openingHistory!.length }×</>
              ) }
            </span>
            { !isReadOnly && (
              <Button variant="outline" size="sm" onClick={ startEdit }>
                <Pencil /> Edit
              </Button>
            ) }
          </div>
        </div>
      ) : isReadOnly ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Opening cash was not verified for this day.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Verified by <span className="text-danger">*</span>
            </label>
            <select
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={ name }
              onChange={ ( e ) => setName( e.target.value ) }
              disabled={ loadingNames }
            >
              <option value="">{ loadingNames ? "Loading…" : "Select in-charge" }</option>
              { nameOptions.map( ( n ) => (
                <option key={ n } value={ n }>
                  { n }
                </option>
              ) ) }
            </select>
            { !loadingNames && incharges.length === 0 && (
              <p className="mt-1.5 text-xs text-danger">
                No in-charges are set up. Ask the admin to add names first.
              </p>
            ) }
          </div>

          { notVerifying && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Why could it not be verified? <span className="text-danger">*</span>
              </label>
              <textarea
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                rows={ 3 }
                maxLength={ 500 }
                placeholder="e.g. ₹500 notes are short by 2"
                value={ note }
                onChange={ ( e ) => setNote( e.target.value ) }
              />
            </div>
          ) }

          { !allChecked && !notVerifying && (
            <p className="text-xs text-muted-foreground">Tick every denomination after counting it.</p>
          ) }
          { error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{ error }</p> }

          { !notVerifying ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                className="flex-1"
                onClick={ () => submit( "verified" ) }
                disabled={ !canVerify }
              >
                { verifying ? "Saving…" : "Verify opening cash" }
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 border-warning/40 text-warning hover:bg-warning-soft hover:text-warning"
                disabled={ verifying }
                onClick={ () => setNotVerifying( true ) }
              >
                Not verified
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1 bg-warning text-white hover:bg-warning/90"
                onClick={ () => submit( "not_verified" ) }
                disabled={ !canFlag }
              >
                { verifying ? "Saving…" : "Submit as not verified" }
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={ verifying }
                onClick={ () =>
                {
                  setNotVerifying( false )
                  setNote( "" )
                  setError( "" )
                } }
              >
                Back
              </Button>
            </div>
          ) }

          { editing && (
            <Button variant="ghost" size="sm" disabled={ verifying } onClick={ cancelEdit } className="w-full">
              Cancel edit
            </Button>
          ) }
        </div>
      ) }
    </Card>
  )
}
