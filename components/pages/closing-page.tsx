"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateClosingCash,
  calculateCashSales,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import
{
  updateClosingCash,
  setNextDayOpening,
  submitDay,
  setAvailableCashHandover,
  setAvailableCheckedDenoms,
  getOpeningCashForDate,
} from "@/app/actions/counter"
import {
  Printer,
  Check,
  Pencil,
  Coins,
  Scale,
  Sunrise,
  HandCoins,
  UserCheck,
  Wand2,
} from "lucide-react"
import SectionHeader from "@/components/section-header"
import { inr as fmt } from "@/lib/report"
import StatusChip from "@/components/status-chip"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useAutosave } from "@/hooks/use-autosave"
import { DenomRow, GroupLabel } from "@/components/denom-row"
import { Notice } from "@/components/notice"
import SaveIndicator from "@/components/save-indicator"
import { getActiveIncharges, type Incharge } from "@/app/actions/incharge"
import {
  COIN_KEYS,
  DENOMS,
  NOTE_KEYS,
  allocateNotes,
  coinsTotal,
  deriveNextDay,
  emptyDenoms,
  notesTotal,
  subtractDenoms,
} from "@/lib/next-day"

/* ================= CONSTANTS ================= */

/* ================= HELPERS ================= */
// 👇 ADD HERE
const cloneDenoms = ( d: DenominationCount ): DenominationCount => ( { ...d } )

/** whole, non-negative count from an input value */
const toCount = ( raw: string ) =>
{
  const n = Math.floor( Number( raw ) )
  return Number.isFinite( n ) && n > 0 ? n : 0
}

/* Unconfirmed next-day choices are kept in the browser so they survive
   switching tabs inside the counter page and refreshing. */
interface NextDraft
{
  requested: string
  notes: DenominationCount
  coins: DenominationCount | null
}

const readDraft = ( key: string ): NextDraft | null =>
{
  try
  {
    if ( typeof window === "undefined" ) return null
    const raw = localStorage.getItem( key )
    return raw ? ( JSON.parse( raw ) as NextDraft ) : null
  } catch
  {
    return null
  }
}

const writeDraft = ( key: string, draft: NextDraft | null ) =>
{
  try
  {
    if ( draft ) localStorage.setItem( key, JSON.stringify( draft ) )
    else localStorage.removeItem( key )
  } catch
  {
    /* storage unavailable: the draft just won't persist */
  }
}

function RecRow ( {
  label,
  value,
  sign,
  tone,
}: {
  label: string
  value: number
  sign?: string
  tone?: "success" | "danger"
} )
{
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{ label }</span>
      <span className={ `font-medium ${ tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "" }` }>
        { sign }₹{ value.toLocaleString( "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 } ) }
      </span>
    </div>
  )
}

export default function ClosingPage ( {
  entry,
  user,
  refreshEntry,
  isReadOnly,
  onEntryPatch,
}: {
  entry: DayEntry
  user: { username: string; counterName?: string }
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
  /** updates the parent's copy of the entry without reloading the page */
  onEntryPatch?: ( patch: Partial<DayEntry> ) => void
} )
{
  /* ================= STATE ================= */

  const [ closing, setClosing ] = useState(
    cloneDenoms( entry.closingDenominations )
  )

  // Next-day opening = every coin + the notes the counter chose to keep
  const wasConfirmed = typeof entry.nextDayNotesRequested === "number"
  const draftKey = `nextDayDraft_${ user.counterName || "default" }_${ entry.date }`
  const [ initialDraft ] = useState<NextDraft | null>( () =>
    isReadOnly ? null : readDraft( draftKey )
  )

  const [ nextNotes, setNextNotes ] = useState<DenominationCount>( () =>
    initialDraft
      ? deriveNextDay( entry.closingDenominations, initialDraft.notes )
      : deriveNextDay(
        entry.closingDenominations,
        wasConfirmed ? entry.nextDayOpeningDenominations : null
      )
  )
  // null = carry every coin; otherwise the coin counts chosen by hand
  const [ coinOverride, setCoinOverride ] = useState<DenominationCount | null>( () =>
  {
    if ( initialDraft ) return initialDraft.coins
    const saved = wasConfirmed ? entry.nextDayOpeningDenominations : null
    if ( !saved ) return null
    const differs = COIN_KEYS.some(
      k => ( saved[ k ] || 0 ) !== ( entry.closingDenominations[ k ] || 0 )
    )
    return differs ? cloneDenoms( saved ) : null
  } )
  const [ requested, setRequested ] = useState(
    initialDraft
      ? initialDraft.requested
      : wasConfirmed
        ? String( entry.nextDayNotesRequested )
        : ""
  )
  const [ reviewing, setReviewing ] = useState( false )
  // after confirming, the section is locked until the counter presses Edit
  const [ editingNext, setEditingNext ] = useState( !!initialDraft && wasConfirmed )
  const [ confirming, setConfirming ] = useState( false )
  const [ nextError, setNextError ] = useState( "" )

  const [ closedBy, setClosedBy ] = useState( entry.closedBy || "" )
  const [ openingCash, setOpeningCash ] = useState( 0 )
  const printRef = useRef<HTMLDivElement>( null )

  const [ incharges, setIncharges ] = useState<Incharge[]>( [] )
  const [ loadingNames, setLoadingNames ] = useState( !isReadOnly )

  // handover tick for the available cash (tied to the amount it was ticked for)
  const [ handedOver, setHandedOver ] = useState( !!entry.availableCashHandedOver )
  const [ handedOverAmount, setHandedOverAmount ] = useState<number | null>(
    entry.availableCashHandedOverAmount ?? null
  )
  const [ handoverBusy, setHandoverBusy ] = useState( false )
  const [ handoverError, setHandoverError ] = useState( "" )

  // per-row ticks in the Available Cash list ("<denomination>:<count>")
  const [ checkedRows, setCheckedRows ] = useState<string[]>(
    entry.availableCheckedDenoms || []
  )
  const rowsSave = useAutosave( {
    value: checkedRows,
    enabled: !isReadOnly,
    save: async keys =>
    {
      const res = await setAvailableCheckedDenoms( keys, entry.date )
      if ( "error" in res && res.error ) return { error: res.error }
      onEntryPatch?.( { availableCheckedDenoms: keys } )
    },
  } )



  // Closed By is chosen from the in-charges the admin has set up
  useEffect( () =>
  {
    if ( isReadOnly ) return
    getActiveIncharges().then( list =>
    {
      setIncharges( list )
      setLoadingNames( false )
    } )
  }, [ isReadOnly ] )

  /* ================= OPENING CASH (SOURCE OF TRUTH) ================= */

  useEffect( () =>
  {
    getOpeningCashForDate( entry.date ).then( res =>
    {
      if ( "cash" in res ) setOpeningCash( res.cash )
    } )
  }, [ entry.date ] )

  /* ================= CALCULATIONS ================= */
  /* ================= CALCULATIONS ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const cashSales = calculateCashSales( entry.sales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash( closing )
  // read-only days show exactly what was saved; open days derive it live
  const nextDay = useMemo(
    () =>
      isReadOnly && entry.nextDayOpeningDenominations
        ? cloneDenoms( entry.nextDayOpeningDenominations )
        : deriveNextDay(
          closing,
          { ...nextNotes, ...( coinOverride ?? {} ) },
          { followCoins: coinOverride === null }
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ closing, nextNotes, coinOverride, isReadOnly ]
  )
  const nextDayTotal = calculateClosingCash( nextDay )

  const requestedNum = Math.max( 0, Number( requested ) || 0 )
  const notesAllocated = notesTotal( nextDay )
  const coinsCarried = coinsTotal( nextDay )
  const notesAvailable = notesTotal( closing )
  // allocation works in ₹10 steps
  const requestedRounded = Math.ceil( requestedNum / 10 ) * 10
  const extraNotes = Math.max( 0, notesAllocated - requestedNum )
  const belowRequested = notesAllocated < requestedRounded

  // what the counter has confirmed matches what is on screen
  const currentKey = JSON.stringify( { n: nextDay, r: requestedNum } )
  const [ confirmedKey, setConfirmedKey ] = useState<string | null>( () =>
    wasConfirmed
      ? JSON.stringify( {
        n: deriveNextDay(
          entry.closingDenominations,
          entry.nextDayOpeningDenominations,
          { followCoins: coinOverride === null }
        ),
        r: entry.nextDayNotesRequested,
      } )
      : null
  )
  const isNextConfirmed = confirmedKey === currentKey
  const nextLocked = !isReadOnly && isNextConfirmed && !editingNext

  // remember unconfirmed work; forget it once it is confirmed, cancelled or locked in
  useEffect( () =>
  {
    if ( isReadOnly || nextLocked )
    {
      writeDraft( draftKey, null )
      return
    }
    writeDraft( draftKey, {
      requested,
      notes: nextNotes,
      coins: coinOverride,
    } )
  }, [ requested, nextNotes, coinOverride, nextLocked, isReadOnly, draftKey ] )

  /* ✅ REQUIRED */
  const availableDenoms = subtractDenoms( closing, nextDay )
  const availableCash = calculateClosingCash( availableDenoms )

  // the tick only counts while the available cash is still the ticked amount
  // every available denomination row must be ticked before the switch can be on
  const allRowsTicked = DENOMS.every(
    ( [ , k ] ) =>
      availableDenoms[ k ] <= 0 || checkedRows.includes( `${ k }:${ availableDenoms[ k ] }` )
  )

  const handoverTicked =
    allRowsTicked &&
    handedOver &&
    handedOverAmount !== null &&
    Math.abs( handedOverAmount - availableCash ) < 0.005

  // un-ticking a row turns the switch off (the server does the same)
  useEffect( () =>
  {
    if ( !allRowsTicked && handedOver ) setHandedOver( false )
  }, [ allRowsTicked, handedOver ] )

  /* ✅ REQUIRED */
  const shortage = expectedCash - actualCash

  /* ================= SALES BREAKUP FOR PRINT ================= */

  // Smart Mart
  const martTotalSales = entry.sales.martTotalSales ?? 0
  const martCardSales = entry.sales.martCardUpi ?? 0
  const martCreditSales = entry.sales.martCredit ?? 0
  const martCashSales =
    martTotalSales - martCardSales - martCreditSales

  // Smart Fashion
  const fashionTotalSales = entry.sales.fashionTotalSales ?? 0
  const fashionCardSales = entry.sales.fashionCardUpi ?? 0
  const fashionCreditSales = entry.sales.fashionCredit ?? 0
  const fashionCashSales =
    fashionTotalSales - fashionCardSales - fashionCreditSales

  // Overall totals
  const totalCashSales = isFashionBoth
    ? martCashSales + fashionCashSales
    : cashSales

  const totalCardSales = isFashionBoth
    ? martCardSales + fashionCardSales
    : entry.sales.cardUpiSales ?? 0

  const totalCreditSales = isFashionBoth
    ? martCreditSales + fashionCreditSales
    : entry.sales.creditSales ?? 0

  const totalSalesForPrint = isFashionBoth
    ? martTotalSales + fashionTotalSales
    : entry.sales.totalSales ?? 0





  /* ================= ACTIONS ================= */

  // Closing cash saves itself: debounced, one request at a time, newest value wins
  const closingSave = useAutosave( {
    value: closing,
    enabled: !isReadOnly,
    save: async snapshot =>
    {
      const res = await updateClosingCash( cloneDenoms( snapshot ), entry.date )
      if ( !( "nextDayOpeningCash" in res ) ) return { error: res.error ?? "Could not save" }
      onEntryPatch?.( {
        closingDenominations: snapshot,
        nextDayOpeningCash: res.nextDayOpeningCash,
        nextDayOpeningDenominations: res.nextDayOpeningDenominations,
      } )
    },
  } )

  const setCount = ( k: keyof DenominationCount, raw: string ) =>
    setClosing( prev => ( { ...prev, [ k ]: toCount( raw ) } ) )

  /* ----- next-day notes ----- */

  const autoFill = ( amount: number ) =>
  {
    const a = allocateNotes( closing, amount )
    setNextNotes( { ...emptyDenoms(), ...a.notes } )
    setReviewing( false )
    setNextError( "" )
  }

  const handleRequestedChange = ( raw: string ) =>
  {
    setRequested( raw )
    autoFill( Math.max( 0, Number( raw ) || 0 ) )
  }

  const setNoteCount = ( k: ( typeof NOTE_KEYS )[ number ], raw: string ) =>
  {
    setReviewing( false )
    setNextNotes( prev => ( { ...prev, [ k ]: Math.min( toCount( raw ), closing[ k ] ) } ) )
  }

  const setCoinCount = ( k: ( typeof COIN_KEYS )[ number ], raw: string ) =>
  {
    setReviewing( false )
    setCoinOverride( prev => ( {
      ...( prev ?? deriveNextDay( closing, null ) ),
      [ k ]: Math.min( toCount( raw ), closing[ k ] ),
    } ) )
  }

  // drop unsaved edits and go back to the last confirmed next-day opening
  const cancelNextEdit = () =>
  {
    const saved = entry.nextDayOpeningDenominations
    if ( saved && typeof entry.nextDayNotesRequested === "number" )
    {
      setNextNotes( deriveNextDay( closing, saved ) )
      const differs = COIN_KEYS.some( k => ( saved[ k ] || 0 ) !== ( closing[ k ] || 0 ) )
      setCoinOverride( differs ? cloneDenoms( saved ) : null )
      setRequested( String( entry.nextDayNotesRequested ) )
    }
    setReviewing( false )
    setNextError( "" )
    setEditingNext( false )
  }

  const startReview = () =>
  {
    setNextError( "" )
    if ( requested.trim() === "" )
    {
      setNextError( "Enter the notes amount needed (enter 0 if no notes are needed)." )
      return
    }
    setReviewing( true )
  }

  const confirmNextDay = async () =>
  {
    setNextError( "" )
    setConfirming( true )

    // make sure the closing count it depends on is stored first
    const stored = await closingSave.flush()
    if ( !stored )
    {
      setNextError( "Closing cash could not be saved yet. Please try again." )
      setConfirming( false )
      return
    }

    const res = await setNextDayOpening( cloneDenoms( nextDay ), entry.date, requestedNum )
    setConfirming( false )
    if ( "error" in res && res.error )
    {
      setNextError( res.error )
      return
    }

    setConfirmedKey( currentKey )
    setReviewing( false )
    setEditingNext( false )
    onEntryPatch?.( {
      nextDayOpeningCash: nextDayTotal,
      nextDayOpeningDenominations: cloneDenoms( nextDay ),
      nextDayNotesRequested: requestedNum,
    } )
  }

  const toggleHandover = async ( checked: boolean ) =>
  {
    setHandoverError( "" )
    setHandoverBusy( true )

    // the server checks the stored ticks and counts, so store them first
    if ( !( await closingSave.flush() ) || !( await rowsSave.flush() ) )
    {
      setHandoverError( "Closing cash could not be saved yet. Please try again." )
      setHandoverBusy( false )
      return
    }

    const res = await setAvailableCashHandover( checked, entry.date )
    setHandoverBusy( false )
    if ( !( "availableCashHandedOverAmount" in res ) )
    {
      setHandoverError( res.error ?? "Could not save" )
      return
    }

    setHandedOver( checked )
    setHandedOverAmount( res.availableCashHandedOverAmount ?? null )
    onEntryPatch?.( {
      availableCashHandedOver: checked,
      availableCashHandedOverAmount: res.availableCashHandedOverAmount,
      availableCashHandedOverAt: res.availableCashHandedOverAt,
    } )
  }

  // keep an already-saved name selectable even if the admin has since removed it
  const closedByOptions =
    closedBy && !incharges.some( i => i.name === closedBy )
      ? [ ...incharges.map( i => i.name ), closedBy ]
      : incharges.map( i => i.name )

  const handleSubmit = async () =>
  {
    if ( entry.payments.length > 0 && !entry.paymentRefNumber )
    {
      alert(
        "❌ Payment Entry Number is required because payments were recorded."
      )
      return
    }

    // ❌ VALIDATION: Closed By is mandatory
    if ( !closedBy || !closedBy.trim() )
    {
      alert( "❌ Please select who is closing the day (Closed By) before submitting." )
      return
    }

    if ( !isNextConfirmed )
    {
      alert( "❌ Please confirm the next-day opening cash before submitting the day." )
      return
    }

    if ( !allRowsTicked )
    {
      alert( "❌ Tick every available cash denomination before submitting the day." )
      return
    }
    if ( !handoverTicked )
    {
      alert( "❌ Turn on \"Available cash checked\" before submitting the day." )
      return
    }
    if ( !( await rowsSave.flush() ) )
    {
      alert( "❌ Your ticks could not be saved. Please try again." )
      return
    }

    // the closing count must be stored before the day is locked
    if ( !( await closingSave.flush() ) )
    {
      alert( "❌ Closing cash could not be saved. Please try again." )
      return
    }

    const res = await submitDay( entry.date, closedBy.trim() )
    if ( res && "error" in res && res.error )
    {
      alert( `❌ ${ res.error }` )
      return
    }
    await refreshEntry()
  }


  const handlePrint = () =>
  {
    if ( !printRef.current ) return

    const w = window.open( "", "_blank", "width=400,height=600" )
    if ( !w ) return

    w.document.open()
    w.document.write( `
<!DOCTYPE html>
<html>
<head>
  <title>Print</title>
  <style>
    * { box-sizing: border-box; }

    @page {
      size: 80mm 150mm; /* 15 cm height */
      margin: 0;
    }

    html, body {
      width: 80mm;
      height: 150mm;
      margin: 0;
      padding: 0;
      font-family: monospace;
      font-size: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    td {
      padding: 2px 0;
    }

    .right { text-align: right; }
    .bold { font-weight: bold; }
    .big { font-size: 14px; font-weight: 800; }
    .line {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
  </style>
</head>

<body>
  ${ printRef.current.innerHTML }

  <script>
    window.onload = function () {
      setTimeout(() => {
        window.print();
        window.close();
      }, 200);
    };
  </script>
</body>
</html>
  `)
    w.document.close()
  }


  /* ================= JSX ================= */

  // everything the counter still has to do before the day can be submitted
  const checklist = [
    { done: isNextConfirmed, label: "Next-day opening confirmed" },
    { done: allRowsTicked && handoverTicked, label: "Available cash checked" },
    { done: !!closedBy.trim(), label: "Closed by selected" },
    ...( entry.payments.length > 0
      ? [ { done: !!entry.paymentRefNumber, label: "Payment entry number added" } ]
      : [] ),
  ]
  const readyToSubmit = checklist.every( c => c.done )

  const noteRows = DENOMS.filter( d => NOTE_KEYS.includes( d[ 1 ] as any ) )
  const coinRows = DENOMS.filter( d => COIN_KEYS.includes( d[ 1 ] as any ) )

  return (
    <div className="space-y-5">

      {/* ================= CLOSING CASH ================= */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <Coins className="size-4" /> }
          title="Closing cash"
          subtitle="Count the drawer and enter how many of each note and coin you have"
        />
        { !isReadOnly && (
          <div className="mt-2">
            <SaveIndicator
              status={ closingSave.status }
              error={ closingSave.errorMessage }
              onRetry={ closingSave.retry }
            />
          </div>
        ) }

        <GroupLabel>Notes</GroupLabel>
        <div className="space-y-1.5">
          { noteRows.map( ( [ l, k, v ] ) => (
            <DenomRow
              key={ k }
              label={ l }
              count={ closing[ k ] }
              amount={ closing[ k ] * v }
              disabled={ isReadOnly }
              onSet={ n => setCount( k, String( n ) ) }
            />
          ) ) }
        </div>

        <GroupLabel>Coins</GroupLabel>
        <div className="space-y-1.5">
          { coinRows.map( ( [ l, k, v ] ) => (
            <DenomRow
              key={ k }
              label={ l }
              count={ closing[ k ] }
              amount={ closing[ k ] * v }
              disabled={ isReadOnly }
              onSet={ n => setCount( k, String( n ) ) }
            />
          ) ) }
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
          <span className="text-sm font-medium">Total counted</span>
          <span className="text-lg font-semibold">₹{ fmt( actualCash ) }</span>
        </div>
      </Card>

      {/* ================= RECONCILIATION ================= */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <Scale className="size-4" /> }
          title="Reconciliation"
          subtitle="What the drawer should hold against what you counted"
        />
        <div className="mt-4 space-y-2 text-sm">
          <RecRow label="Opening cash" value={ openingCash } />
          <RecRow label="Cash sales" value={ cashSales } sign="+" tone="success" />
          <RecRow label="Payments in" value={ totalIn } sign="+" tone="success" />
          <RecRow label="Payments out" value={ totalOut } sign="−" tone="danger" />
          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <span>Expected cash</span>
            <span>₹{ fmt( expectedCash ) }</span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span>Counted cash</span>
            <span>₹{ fmt( actualCash ) }</span>
          </div>
        </div>

        <div
          className={ `mt-4 flex items-center justify-between rounded-xl px-4 py-3 ${ Math.abs( shortage ) < 0.005
            ? "bg-success-soft text-success"
            : shortage > 0
              ? "bg-danger-soft text-danger"
              : "bg-info-soft text-info"
            }` }
        >
          <span className="text-sm font-semibold">
            { Math.abs( shortage ) < 0.005 ? "Balanced" : shortage > 0 ? "Shortage" : "Excess" }
          </span>
          <span className="text-xl font-semibold">₹{ fmt( Math.abs( shortage ) ) }</span>
        </div>
      </Card>

      {/* ================= NEXT DAY OPENING ================= */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <Sunrise className="size-4" /> }
          title="Next-day opening"
          subtitle="Cash that stays in the drawer for tomorrow"
          right={
            !isReadOnly ? (
              isNextConfirmed && !editingNext ? (
                <StatusChip tone="success">Confirmed</StatusChip>
              ) : editingNext ? (
                <StatusChip tone="info">Editing</StatusChip>
              ) : (
                <StatusChip tone="warning">Not confirmed</StatusChip>
              )
            ) : undefined
          }
        />

        { !isReadOnly && (
          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium">
              Notes needed for tomorrow <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  ₹
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={ 0 }
                  step={ 10 }
                  placeholder="e.g. 3000"
                  value={ requested }
                  onChange={ e => handleRequestedChange( e.target.value ) }
                  onWheel={ e => ( e.target as HTMLInputElement ).blur() }
                  disabled={ nextLocked }
                  className="pl-7"
                />
              </div>
              <Button
                variant="outline"
                type="button"
                disabled={ requested.trim() === "" || nextLocked }
                onClick={ () => autoFill( requestedNum ) }
              >
                <Wand2 /> Auto-fill
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coins are not included. The smallest notes are used first, up to the notes you
              counted.
            </p>
          </div>
        ) }

        <GroupLabel
          right={
            !isReadOnly && !nextLocked && coinOverride !== null ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={ () =>
                {
                  setReviewing( false )
                  setCoinOverride( null )
                } }
              >
                Carry all coins
              </button>
            ) : undefined
          }
        >
          Coins
        </GroupLabel>
        <div className="space-y-1.5">
          { coinRows.map( ( [ l, k, v ] ) => (
            <DenomRow
              key={ k }
              label={ l }
              count={ nextDay[ k ] }
              amount={ nextDay[ k ] * v }
              sub={ isReadOnly ? undefined : `of ${ closing[ k ] }` }
              max={ closing[ k ] }
              disabled={ isReadOnly || nextLocked }
              onSet={ n => setCoinCount( k as ( typeof COIN_KEYS )[ number ], String( n ) ) }
            />
          ) ) }
        </div>

        <GroupLabel>Notes</GroupLabel>
        <div className="space-y-1.5">
          { noteRows.map( ( [ l, k, v ] ) => (
            <DenomRow
              key={ k }
              label={ l }
              count={ nextDay[ k ] }
              amount={ nextDay[ k ] * v }
              sub={ isReadOnly ? undefined : `of ${ closing[ k ] }` }
              max={ closing[ k ] }
              disabled={ isReadOnly || nextLocked }
              onSet={ n => setNoteCount( k as ( typeof NOTE_KEYS )[ number ], String( n ) ) }
            />
          ) ) }
        </div>

        {/* SUMMARY */ }
        <div className="mt-4 space-y-1.5 rounded-xl border p-4 text-sm">
          { !isReadOnly && (
            <div className="flex justify-between text-muted-foreground">
              <span>Requested notes</span>
              <span>₹{ fmt( requestedNum ) }</span>
            </div>
          ) }
          <div className="flex justify-between">
            <span>Notes</span>
            <span>₹{ fmt( notesAllocated ) }</span>
          </div>
          { !isReadOnly && extraNotes > 0 && (
            <div className="flex justify-between text-warning">
              <span>Extra beyond requested</span>
              <span>+ ₹{ fmt( extraNotes ) }</span>
            </div>
          ) }
          <div className="flex justify-between">
            <span>Coins</span>
            <span>₹{ fmt( coinsCarried ) }</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>Opening cash tomorrow</span>
            <span>₹{ fmt( nextDayTotal ) }</span>
          </div>
        </div>

        { !isReadOnly && requestedNum > notesAvailable && (
          <Notice tone="danger">
            You only have ₹{ fmt( notesAvailable ) } in notes, so ₹{ fmt( requestedNum ) } cannot
            be reached. All available notes were used.
          </Notice>
        ) }
        { !isReadOnly && requestedNum <= notesAvailable && requested.trim() !== "" && belowRequested && (
          <Notice tone="warning">
            Notes are ₹{ fmt( requestedRounded - notesAllocated ) } below the requested amount.
          </Notice>
        ) }
        { nextError && <Notice tone="danger">{ nextError }</Notice> }

        {/* CONFIRM / EDIT */ }
        { nextLocked && (
          <Button variant="outline" className="mt-4 w-full" onClick={ () =>
          {
            setNextError( "" )
            setEditingNext( true )
          } }>
            <Pencil /> Edit next-day opening
          </Button>
        ) }

        { !isReadOnly && !reviewing && !nextLocked && (
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" size="lg" onClick={ startReview }>
              Review &amp; confirm
            </Button>
            { editingNext && typeof entry.nextDayNotesRequested === "number" && (
              <Button variant="outline" size="lg" onClick={ cancelNextEdit }>
                Cancel
              </Button>
            ) }
          </div>
        ) }

        { !isReadOnly && reviewing && (
          <div className="mt-4 space-y-3 rounded-xl border-2 border-primary/40 bg-accent/40 p-4">
            <div className="font-semibold">Confirm next-day opening</div>
            <div className="space-y-1 text-sm">
              { DENOMS.map( ( [ l, k, v ] ) =>
                nextDay[ k ] > 0 ? (
                  <div key={ k } className="flex justify-between">
                    <span>
                      { l }{ COIN_KEYS.includes( k as any ) ? " coin" : "" } × { nextDay[ k ] }
                    </span>
                    <span>₹{ fmt( nextDay[ k ] * v ) }</span>
                  </div>
                ) : null
              ) }
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>₹{ fmt( nextDayTotal ) }</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={ confirmNextDay } disabled={ confirming }>
                { confirming ? "Saving…" : "Confirm & save" }
              </Button>
              <Button variant="outline" onClick={ () => setReviewing( false ) } disabled={ confirming }>
                Edit
              </Button>
            </div>
          </div>
        ) }
      </Card>

      {/* ================= AVAILABLE CASH ================= */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <HandCoins className="size-4" /> }
          title="Available cash"
          subtitle="What is left after tomorrow's opening. Tick each line as you check it."
        />

        <div className="mt-4 space-y-1.5">
          { availableCash === 0 && (
            <div className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
              No available cash.
            </div>
          ) }
          { DENOMS.map( ( [ l, k, v ] ) =>
          {
            if ( availableDenoms[ k ] <= 0 ) return null
            const rowKey = `${ k }:${ availableDenoms[ k ] }`
            const ticked = checkedRows.includes( rowKey )
            const isCoin = COIN_KEYS.includes( k as any )
            return (
              <label
                key={ k }
                className={ `flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${ ticked ? "border-success/30 bg-success-soft" : "bg-card hover:bg-secondary/60"
                  } ${ isReadOnly ? "cursor-default" : "" }` }
              >
                <Checkbox
                  checked={ ticked }
                  disabled={ isReadOnly }
                  aria-label={ `Checked ${ l }` }
                  onCheckedChange={ on =>
                    setCheckedRows( prev =>
                    {
                      const rest = prev.filter( r => !r.startsWith( `${ k }:` ) )
                      return on === true ? [ ...rest, rowKey ] : rest
                    } )
                  }
                />
                <span className="flex-1 text-sm">
                  <span className="font-semibold">{ l }</span>
                  { isCoin && <span className="text-muted-foreground"> coin</span> }
                  <span className="text-muted-foreground"> × { availableDenoms[ k ] }</span>
                </span>
                <span className="text-sm font-medium">₹{ fmt( availableDenoms[ k ] * v ) }</span>
              </label>
            )
          } ) }
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
          <span className="text-sm font-medium">Available cash total</span>
          <span className="text-lg font-semibold">₹{ fmt( availableCash ) }</span>
        </div>

        { rowsSave.status === "error" && (
          <Notice tone="danger">
            Ticks could not be saved.{ " " }
            <button className="underline" onClick={ rowsSave.retry }>
              Retry
            </button>
          </Notice>
        ) }

        {/* CHECKED SWITCH */ }
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <div className="text-sm font-semibold">Available cash checked</div>
            <div className="text-xs text-muted-foreground">
              { !isReadOnly && !isNextConfirmed
                ? "Confirm the next-day opening first."
                : !isReadOnly && !allRowsTicked
                  ? "Tick every line above to turn this on."
                  : !isReadOnly && handedOver && !handoverTicked && handedOverAmount !== null
                    ? "Available cash changed. Switch on again."
                    : handoverTicked
                      ? "All lines checked."
                      : "Switch on once everything is checked." }
            </div>
          </div>
          <Switch
            checked={ handoverTicked }
            disabled={ isReadOnly || handoverBusy || !isNextConfirmed || !allRowsTicked }
            onCheckedChange={ v => toggleHandover( v === true ) }
            aria-label="Available cash checked"
          />
        </div>
        { handoverError && <Notice tone="danger">{ handoverError }</Notice> }
      </Card>

      {/* ================= FINISH ================= */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <UserCheck className="size-4" /> }
          title="Closed by"
          subtitle="The in-charge closing the day"
        />

        { isReadOnly ? (
          <div className="mt-3 text-sm font-medium">{ closedBy || "—" }</div>
        ) : (
          <>
            <select
              className="mt-3 h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={ closedBy }
              disabled={ loadingNames }
              onChange={ e => setClosedBy( e.target.value ) }
            >
              <option value="">{ loadingNames ? "Loading…" : "Select in-charge" }</option>
              { closedByOptions.map( name => (
                <option key={ name } value={ name }>
                  { name }
                </option>
              ) ) }
            </select>
            { !loadingNames && incharges.length === 0 && (
              <Notice tone="danger">
                No in-charges are set up. Ask the admin to add names first.
              </Notice>
            ) }
          </>
        ) }
      </Card>

      { !isReadOnly && (
        <Card className="p-5">
          <div className="text-sm font-semibold">Before you submit</div>
          <ul className="mt-3 space-y-2">
            { checklist.map( c => (
              <li key={ c.label } className="flex items-center gap-2.5 text-sm">
                <span
                  className={ `grid size-5 place-items-center rounded-full ${ c.done ? "bg-success text-white" : "border-2 border-muted-foreground/30"
                    }` }
                >
                  { c.done && <Check className="size-3" /> }
                </span>
                <span className={ c.done ? "text-muted-foreground line-through" : "" }>{ c.label }</span>
              </li>
            ) ) }
          </ul>
        </Card>
      ) }

      {/* PRINT PREVIEW */ }
      {/* PRINT PREVIEW */ }
      {/* PRINT PREVIEW */ }
      <details className="group rounded-2xl border bg-card">
        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-muted-foreground group-open:text-foreground">
          Receipt preview
        </summary>
      <div ref={ printRef } className="receipt p-5 text-sm">
        <div className="center bold">Smart Mart & Smart Fashions</div>
        <div className="center bold">{ user.counterName }</div>
        <div className="center text-xs">{ entry.date }</div>
        <div className="line" />

        <table>
          <tbody>
            <tr>
              <td>Opening Cash</td>
              <td className="right">₹{ openingCash.toFixed( 2 ) }</td>
            </tr>

            <tr className="line" />

            <tr className="bold">
              <td>Total Sales</td>
              <td className="right">
                ₹{ totalSalesForPrint.toFixed( 2 ) }
              </td>
            </tr>

            {/* SMART FASHION BOTH */ }
            { isFashionBoth ? (
              <>
                <tr className="bold">
                  <td colSpan={ 2 }>Smart Mart</td>
                </tr>
                <tr>
                  <td>Total Sales</td>
                  <td className="right">₹{ martTotalSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Cash Sales</td>
                  <td className="right">₹{ martCashSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Card / UPI</td>
                  <td className="right">₹{ martCardSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Credit</td>
                  <td className="right">₹{ martCreditSales.toFixed( 2 ) }</td>
                </tr>

                <tr className="bold">
                  <td colSpan={ 2 }>Smart Fashion</td>
                </tr>
                <tr>
                  <td>Total Sales</td>
                  <td className="right">₹{ fashionTotalSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Cash Sales</td>
                  <td className="right">₹{ fashionCashSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Card / UPI</td>
                  <td className="right">₹{ fashionCardSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Credit</td>
                  <td className="right">₹{ fashionCreditSales.toFixed( 2 ) }</td>
                </tr>

                <tr className="bold">
                  <td>TOTAL CASH SALES</td>
                  <td className="right">₹{ totalCashSales.toFixed( 2 ) }</td>
                </tr>
                <tr className="bold">
                  <td>TOTAL CARD SALES</td>
                  <td className="right">₹{ totalCardSales.toFixed( 2 ) }</td>
                </tr>
                <tr className="bold">
                  <td>TOTAL CREDIT SALES</td>
                  <td className="right">₹{ totalCreditSales.toFixed( 2 ) }</td>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <td>Cash Sales</td>
                  <td className="right">₹{ cashSales.toFixed( 2 ) }</td>
                </tr>
                <tr>
                  <td>Card / UPI Sales</td>
                  <td className="right">
                    ₹{ ( entry.sales.cardUpiSales ?? 0 ).toFixed( 2 ) }
                  </td>
                </tr>
                <tr>
                  <td>Credit Sales</td>
                  <td className="right">
                    ₹{ ( entry.sales.creditSales ?? 0 ).toFixed( 2 ) }
                  </td>
                </tr>

                <tr className="bold">
                  <td>TOTAL CASH SALES</td>
                  <td className="right">₹{ cashSales.toFixed( 2 ) }</td>
                </tr>
                <tr className="bold">
                  <td>TOTAL CARD SALES</td>
                  <td className="right">
                    ₹{ ( entry.sales.cardUpiSales ?? 0 ).toFixed( 2 ) }
                  </td>
                </tr>
                <tr className="bold">
                  <td>TOTAL CREDIT SALES</td>
                  <td className="right">
                    ₹{ ( entry.sales.creditSales ?? 0 ).toFixed( 2 ) }
                  </td>
                </tr>
              </>
            ) }

            <tr className="line" />

            <tr>
              <td>Payments IN</td>
              <td className="right">₹{ totalIn.toFixed( 2 ) }</td>
            </tr>
            <tr>
              <td>Payments OUT</td>
              <td className="right">₹{ totalOut.toFixed( 2 ) }</td>
            </tr>

            <tr>
              <td>Payment Entry No</td>
              <td className="right">{ entry.paymentRefNumber || "-" }</td>
            </tr>

            <tr className="line" />

            <tr className="bold">
              <td>Expected Cash</td>
              <td className="right">₹{ expectedCash.toFixed( 2 ) }</td>
            </tr>
            <tr className="bold">
              <td>Actual Cash</td>
              <td className="right">₹{ actualCash.toFixed( 2 ) }</td>
            </tr>
            <tr className="bold">
              <td>{ shortage > 0 ? "SHORTAGE" : "EXCESS" }</td>
              <td className="right">
                ₹{ Math.abs( shortage ).toFixed( 2 ) }
              </td>
            </tr>

            <tr className="line" />

            <tr className="bold">
              <td>Next Day Opening</td>
              <td className="right">₹{ nextDayTotal.toFixed( 2 ) }</td>
            </tr>

            <tr className="bold">
              <td>Total Available Cash</td>
              <td className="right">₹{ availableCash.toFixed( 2 ) }</td>
            </tr>
            <tr>
              <td>Available cash checked</td>
              <td className="right">{ handoverTicked ? "YES" : "NO" }</td>
            </tr>
          </tbody>
        </table>

        <div className="line" />
        <div className="center bold">Available Cash Denominations</div>

        <table>
          <tbody>
            { DENOMS.map( ( [ label, key, value ] ) =>
              availableDenoms[ key ] > 0 ? (
                <tr key={ key }>
                  <td>{ label } × { availableDenoms[ key ] }</td>
                  <td className="right">
                    ₹{ ( availableDenoms[ key ] * value ).toFixed( 2 ) }
                  </td>
                </tr>
              ) : null
            ) }
            <tr className="bold">
              <td>Available Cash Total</td>
              <td className="right">₹{ availableCash.toFixed( 2 ) }</td>
            </tr>
          </tbody>
        </table>

        <div className="line" />
        <div className="flex justify-between bold">
          <span>Closed By</span>
          <span>{ closedBy || "-" }</span>
        </div>
      </div>
      </details>




      { isReadOnly ? (
        <Button variant="outline" size="lg" className="w-full" onClick={ handlePrint }>
          <Printer /> Print cash summary
        </Button>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl gap-2 px-4 py-3">
            <Button
              variant="outline"
              size="lg"
              onClick={ handlePrint }
              aria-label="Print cash summary"
              title="Print cash summary"
            >
              <Printer />
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={ handleSubmit }
              disabled={ !readyToSubmit }
            >
              { readyToSubmit ? "Submit day" : "Complete the checklist to submit" }
            </Button>
          </div>
        </div>
      ) }

    </div>
  )
}
