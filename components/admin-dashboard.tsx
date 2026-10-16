"use client"

import { useState, useMemo, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getAllEntries, confirmEntry, unlockEntry } from "@/app/actions/admin"
import type { DayEntry } from "@/lib/types"
import
  {
    calculateCashSales,
    calculatePaymentSummary,
    calculateClosingCash,
  } from "@/lib/types"
import {
  LogOut,
  Unlock,
  KeyRound,
  Users,
  BarChart3,
  PackageSearch,
  Landmark,
  CheckCheck,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from "lucide-react"
import StatusChip from "./status-chip"
import { inr as money, todayIST } from "@/lib/report"
import { subtractDenoms } from "@/lib/next-day"
import { confirmPurchaseDay, loadDayView, unlockPurchaseDay } from "@/app/actions/purchase"
import type { DayView } from "@/lib/purchase-service"
import AdminEntryDetailModal from "./admin-entry-detail-modal"
import AdminTransfersPanel from "./admin-transfers-panel"
import TransferButton from "./transfer-button"
import { useRouter } from "next/navigation"

/* ================= HELPERS ================= */

const formatTime = ( iso?: string ) =>
  iso
    ? new Date( iso ).toLocaleTimeString( "en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    } )
    : "-"

/* ================= COMPONENT ================= */

interface AdminDashboardProps
{
  initialEntries: DayEntry[]
  /** every counter with a login, so counters that have not started still show */
  counterNames?: string[]
  /** supervisors see the same dashboard, read-only */
  variant?: "admin" | "supervisor"
}

export default function AdminDashboard ( {
  initialEntries,
  counterNames = [],
  variant = "admin",
}: AdminDashboardProps )
{
  const router = useRouter()
  const [ entries, setEntries ] = useState<DayEntry[]>( initialEntries )
  const [ selectedDate, setSelectedDate ] = useState( todayIST() )
  const isAdmin = variant === "admin"
  // bumped when the transfer pop-up closes so the transfers list reloads
  const [ transferTick, setTransferTick ] = useState( 0 )

  // the purchase counter's day for the selected date
  const [ purchase, setPurchase ] = useState<DayView | null>( null )
  useEffect( () =>
  {
    let stale = false
    loadDayView( selectedDate ).then( v =>
    {
      if ( !stale ) setPurchase( v )
    } )
    return () =>
    {
      stale = true
    }
  }, [ selectedDate ] )
  const [ selectedEntry, setSelectedEntry ] = useState<DayEntry | null>( null )

  /* ================= DEDUPE ================= */

  const uniqueEntries = useMemo( () =>
  {
    const map = new Map<string, DayEntry>()

    for ( const entry of entries )
    {
      const key = `${ entry.counterName }_${ entry.date }`

      if ( !map.has( key ) )
      {
        map.set( key, entry )
        continue
      }

      const rank = ( e: DayEntry ) =>
        e.status === "confirmed" ? 3 : e.status === "submitted" ? 2 : 1

      if ( rank( entry ) > rank( map.get( key )! ) )
      {
        map.set( key, entry )
      }
    }

    return Array.from( map.values() )
  }, [ entries ] )

  /* ================= DATE ================= */

  const handleDateChange = async ( date: string ) =>
  {
    setSelectedDate( date )
    setEntries( await getAllEntries( date ) )
  }

  /* ================= ACTIONS ================= */

  const handleConfirm = async ( id: string ) =>
  {
    if ( confirm( "Confirm this entry?" ) )
    {
      await confirmEntry( id )
      const fresh = await getAllEntries( selectedDate )
      setEntries( fresh )
      // keep an open details popup in step with the list
      setSelectedEntry( cur =>
        cur ? fresh.find( e => e._id === cur._id ) ?? null : null
      )
    }
  }

  const handleUnlock = async ( id: string ) =>
  {
    if ( confirm( "Unlock this entry?" ) )
    {
      await unlockEntry( id )
      setEntries( await getAllEntries( selectedDate ) )
    }
  }

  const handlePurchaseConfirm = async () =>
  {
    if ( !confirm( "Confirm the purchase counter's day?" ) ) return
    const res = await confirmPurchaseDay( selectedDate )
    if ( res.error ) return alert( res.error )
    setPurchase( await loadDayView( selectedDate ) )
  }

  const handlePurchaseUnlock = async () =>
  {
    if ( !confirm( "Unlock the purchase counter's day so it can be changed?" ) ) return
    const res = await unlockPurchaseDay( selectedDate )
    if ( res.error ) return alert( res.error )
    setPurchase( await loadDayView( selectedDate ) )
  }

  /* ================= SUMMARY ================= */

  const summary = useMemo( () =>
  {
    let totalCashSales = 0
    let totalCardUpi = 0
    let totalCredit = 0
    let totalAvailableCash = 0
    let totalShortage = 0
    let totalPaymentsOut = 0

    let smartMartTotal = 0
    let smartFashionTotal = 0
    let smartFancyTotal = 0

    uniqueEntries.forEach( entry =>
    {
      const isBoth = entry.counterName === "Smart Fashion (Both)"
      const cashSales = calculateCashSales( entry.sales, isBoth )

      const { totalOut } = calculatePaymentSummary( entry.payments )
      totalPaymentsOut += totalOut

      const availableCash = calculateClosingCash(
        subtractDenoms(
          entry.closingDenominations,
          entry.nextDayOpeningDenominations
        )
      )

      const card = isBoth
        ? ( entry.sales.martCardUpi || 0 ) +
        ( entry.sales.fashionCardUpi || 0 )
        : entry.sales.cardUpiSales || 0

      const credit = isBoth
        ? ( entry.sales.martCredit || 0 ) +
        ( entry.sales.fashionCredit || 0 )
        : entry.sales.creditSales || 0

      totalCashSales += cashSales
      totalCardUpi += card
      totalCredit += credit
      totalAvailableCash += availableCash

      const total = cashSales + card + credit

      if ( entry.counterName.includes( "Fancy" ) ) smartFancyTotal += total
      else if ( entry.counterName.includes( "Fashion" ) )
        smartFashionTotal += total
      else smartMartTotal += total

      if ( entry.status !== "open" )
      {
        totalShortage += entry.submittedShortage || 0
      }
    } )

    return {
      totalSales: totalCashSales + totalCardUpi + totalCredit,
      totalCashSales,
      totalCardUpi,
      totalCredit,
      totalPaymentsOut,
      totalAvailableCash,
      totalShortage,
      smartMartTotal,
      smartFashionTotal,
      smartFancyTotal,
    }
  }, [ uniqueEntries ] )

  /* ================= RENDER ================= */

  // counters that have a login but no day yet (they create it by signing in)
  const notStarted = counterNames.filter( n => !uniqueEntries.some( e => e.counterName === n ) )
  const totalCounters = uniqueEntries.length + notStarted.length

  const submittedCount = uniqueEntries.filter( e => e.status !== "open" ).length
  const waitingForYou = uniqueEntries.filter( e => e.status === "submitted" ).length
  const split = summary.totalCashSales + summary.totalCardUpi + summary.totalCredit
  const pct = ( n: number ) => ( split > 0 ? ( n / split ) * 100 : 0 )

  const prettyDate = new Date( selectedDate + "T00:00:00" ).toLocaleDateString( "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  } )

  return (
    <div className="min-h-screen bg-background">
      {/* ================= HEADER ================= */ }
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight">{ isAdmin ? "Admin dashboard" : "Supervisor dashboard" }</h1>
                <p className="truncate text-xs text-muted-foreground">Smart Mart &amp; Smart Fashions</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={ selectedDate }
                onChange={ e => handleDateChange( e.target.value ) }
                className="h-9 w-auto text-sm"
                aria-label="Select date"
              />
              <Button variant="ghost" size="icon" onClick={ () => logout() } aria-label="Log out" title="Log out">
                <LogOut />
              </Button>
            </div>
          </div>

          <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-3">
            <Button variant="outline" size="sm" onClick={ () => router.push( "/admin/counter-comparison" ) }>
              <BarChart3 /> Reports
            </Button>
            <Button variant="outline" size="sm" onClick={ () => router.push( "/purchase" ) }>
              <PackageSearch /> Purchase
            </Button>
            { isAdmin && (
              <TransferButton
                refreshEntry={ async () => {} }
                onClosed={ () => setTransferTick( n => n + 1 ) }
              />
            ) }
            { isAdmin && (
              <Button variant="outline" size="sm" onClick={ () => router.push( "/purchase/cheques" ) }>
                <Landmark /> Cheques &amp; banks
              </Button>
            ) }
            { isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={ () => router.push( "/admin/incharges" ) }>
                  <Users /> In-charges
                </Button>
                <Button variant="outline" size="sm" onClick={ () => router.push( "/admin/passwords" ) }>
                  <KeyRound /> Passwords
                </Button>
              </>
            ) }
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5">
        <div>
          <h2 className="text-lg font-semibold">{ prettyDate }</h2>
          <p className="text-sm text-muted-foreground">
            { submittedCount } of { totalCounters } counters submitted
            { isAdmin && waitingForYou > 0 && <> · <span className="font-medium text-warning">{ waitingForYou } waiting for your confirmation</span></> }
          </p>
        </div>

        {/* ================= SUMMARY ================= */ }
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="text-sm text-muted-foreground">Total sales</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight">₹{ money( summary.totalSales ) }</div>

            {/* cash / card / credit split */ }
            <div className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-secondary">
              <div className="rounded-full bg-series-1" style={ { width: `${ pct( summary.totalCashSales ) }%` } } />
              <div className="rounded-full bg-series-2" style={ { width: `${ pct( summary.totalCardUpi ) }%` } } />
              <div className="rounded-full bg-series-3" style={ { width: `${ pct( summary.totalCredit ) }%` } } />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <Legend color="bg-series-1" label="Cash" value={ summary.totalCashSales } />
              <Legend color="bg-series-2" label="Card / UPI" value={ summary.totalCardUpi } />
              <Legend color="bg-series-3" label="Credit" value={ summary.totalCredit } />
            </div>
          </Card>

          <Card
            className={ `p-5 ${ summary.totalShortage > 0.005
              ? "border-danger/30 bg-danger-soft"
              : summary.totalShortage < -0.005
                ? "border-info/30 bg-info-soft"
                : "" }` }
          >
            <div className="text-sm text-muted-foreground">
              { summary.totalShortage > 0.005
                ? "Total shortage"
                : summary.totalShortage < -0.005
                  ? "Total excess"
                  : "Cash position" }
            </div>
            <div
              className={ `mt-1 text-3xl font-semibold tracking-tight ${ summary.totalShortage > 0.005 ? "text-danger" : summary.totalShortage < -0.005 ? "text-info" : "text-success" }` }
            >
              { Math.abs( summary.totalShortage ) < 0.005 ? "Balanced" : `₹${ money( Math.abs( summary.totalShortage ) ) }` }
            </div>
            <p className="mt-2 text-xs text-muted-foreground">From counters that have submitted their day.</p>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Mini label="Smart Mart" value={ summary.smartMartTotal } />
          <Mini label="Smart Fashion" value={ summary.smartFashionTotal } />
          <Mini label="Smart Fancy" value={ summary.smartFancyTotal } />
          <Mini label="Payments out" value={ summary.totalPaymentsOut } tone="danger" />
          <Mini label="Available cash" value={ summary.totalAvailableCash } />
        </div>

        {/* ================= PURCHASE ================= */ }
        { !purchase && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground">
                  <PackageSearch className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    Purchase counter
                    <StatusChip tone="neutral">Not started</StatusChip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    { selectedDate === todayIST() ? "Starts when the purchase counter opens its day." : "No purchase activity on this date." }
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={ () => router.push( `/purchase?date=${ selectedDate }` ) }>
                <Eye /> Open
              </Button>
            </div>
          </Card>
        ) }
        { purchase && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <PackageSearch className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    Purchase counter
                    { purchase.day.status === "open" && <StatusChip tone="info">Open</StatusChip> }
                    { purchase.day.status === "submitted" && <StatusChip tone="warning">Awaiting confirmation</StatusChip> }
                    { purchase.day.status === "confirmed" && <StatusChip tone="success">Confirmed</StatusChip> }
                  </div>
                  <div className="text-xs text-muted-foreground">
                    { purchase.summary.vendorsPaid } vendor{ purchase.summary.vendorsPaid === 1 ? "" : "s" } paid
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={ () => router.push( `/purchase?date=${ selectedDate }` ) }>
                  <Eye /> Open
                </Button>
                { isAdmin && purchase.day.status === "submitted" && (
                  <Button size="sm" onClick={ handlePurchaseConfirm }>
                    <CheckCheck /> Confirm
                  </Button>
                ) }
                { isAdmin && purchase.day.status !== "open" && (
                  <Button size="sm" variant="ghost" onClick={ handlePurchaseUnlock }>
                    <Unlock /> Unlock
                  </Button>
                ) }
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
              <Metric label="Cash received" value={ `₹${ money( purchase.summary.received ) }` } />
              <Metric label="Paid to vendors" value={ `₹${ money( purchase.summary.paidTotal ) }` } strong />
              <Metric label="Cash in hand" value={ `₹${ money( purchase.summary.expected ) }` } />
              <Metric
                label={ purchase.day.status === "open" ? "Not submitted yet" : "Shortage / excess" }
                value={
                  purchase.day.status === "open"
                    ? "—"
                    : Math.abs( purchase.summary.shortage ) < 0.005
                      ? "Balanced"
                      : `${ purchase.summary.shortage > 0 ? "Short" : "Excess" } ₹${ money( Math.abs( purchase.summary.shortage ) ) }`
                }
              />
            </dl>

            { purchase.day.status !== "open" && ( purchase.day.handoverAmount ?? 0 ) > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
                <span>
                  Handed over to admin: <strong>₹{ money( purchase.day.handoverAmount ?? 0 ) }</strong>
                  <span className="text-muted-foreground"> · kept for tomorrow ₹{ money( purchase.summary.keep ) }</span>
                </span>
                { purchase.day.handoverReceivedAt ? (
                  <StatusChip tone="success">Received</StatusChip>
                ) : (
                  <StatusChip tone="warning">To collect</StatusChip>
                ) }
              </div>
            ) }
          </Card>
        ) }

        <AdminTransfersPanel key={ transferTick } date={ selectedDate } canAcknowledge={ isAdmin } />

        {/* ================= COUNTERS ================= */ }
        <section>
          <h2 className="mb-3 text-base font-semibold">Counters</h2>

          { totalCounters === 0 && (
            <Card className="py-14 text-center text-sm text-muted-foreground">
              No counter activity on this date.
            </Card>
          ) }

          <div className="grid gap-4 md:grid-cols-2">
            { notStarted.map( name => (
              <Card key={ `ns_${ name }` } className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-tight">{ name }</h3>
                  <StatusChip tone="neutral">Not started</StatusChip>
                </div>
                <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  { selectedDate === todayIST() ? "Hasn't signed in yet today." : "No entry on this date." }
                </p>
              </Card>
            ) ) }
            { uniqueEntries.map( entry =>
            {
              const isBoth = entry.counterName === "Smart Fashion (Both)"
              const cashSales = calculateCashSales( entry.sales, isBoth )
              const { totalOut } = calculatePaymentSummary( entry.payments )

              const availableCash = calculateClosingCash(
                subtractDenoms( entry.closingDenominations, entry.nextDayOpeningDenominations )
              )

              const card = isBoth
                ? ( entry.sales.martCardUpi || 0 ) + ( entry.sales.fashionCardUpi || 0 )
                : entry.sales.cardUpiSales || 0

              const credit = isBoth
                ? ( entry.sales.martCredit || 0 ) + ( entry.sales.fashionCredit || 0 )
                : entry.sales.creditSales || 0

              const totalSales = cashSales + card + credit
              const shortage = entry.submittedShortage || 0
              const settled = entry.status !== "open"
              const flagged = entry.openingVerifyStatus === "not_verified"

              return (
                <Card key={ entry._id } className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold leading-tight">{ entry.counterName }</h3>
                    { entry.status === "open" && <StatusChip tone="info">Open</StatusChip> }
                    { entry.status === "submitted" && <StatusChip tone="warning">Submitted</StatusChip> }
                    { entry.status === "confirmed" && <StatusChip tone="success">Confirmed</StatusChip> }
                  </div>

                  {/* opening cash check */ }
                  <div
                    className={ `mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${ !entry.openingVerified
                      ? "bg-danger-soft text-danger"
                      : flagged
                        ? "bg-warning-soft text-warning"
                        : "bg-success-soft text-success" }` }
                  >
                    { !entry.openingVerified ? (
                      <Clock className="mt-0.5 size-3.5 shrink-0" />
                    ) : flagged ? (
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                    ) }
                    <div className="min-w-0">
                      { !entry.openingVerified ? (
                        <span className="font-medium">Opening cash not checked yet</span>
                      ) : flagged ? (
                        <>
                          <span className="font-medium">
                            Opening could not be verified
                            { entry.openingVerifiedBy && ` · ${ entry.openingVerifiedBy }` }
                            { ` · ${ formatTime( entry.openingVerifiedAt as string ) }` }
                          </span>
                          { entry.openingNote && (
                            <span className="block font-normal opacity-90">Reason: { entry.openingNote }</span>
                          ) }
                        </>
                      ) : (
                        <span className="font-medium">
                          Opening verified
                          { entry.openingVerifiedBy && ` by ${ entry.openingVerifiedBy }` }
                          { ` · ${ formatTime( entry.openingVerifiedAt as string ) }` }
                        </span>
                      ) }
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Metric label="Total sales" value={ `₹${ money( totalSales ) }` } strong />
                    <Metric label="Cash sales" value={ `₹${ money( cashSales ) }` } />
                    <Metric label="Payments out" value={ `₹${ money( totalOut ) }` } />
                    <Metric label="Available cash" value={ `₹${ money( availableCash ) }` } />
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="text-sm">
                      { !settled ? (
                        <span className="text-muted-foreground">Not submitted yet</span>
                      ) : Math.abs( shortage ) < 0.005 ? (
                        <span className="font-medium text-success">Balanced</span>
                      ) : shortage > 0 ? (
                        <span className="font-semibold text-danger">Shortage ₹{ money( shortage ) }</span>
                      ) : (
                        <span className="font-semibold text-info">Excess ₹{ money( -shortage ) }</span>
                      ) }
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={ () => setSelectedEntry( entry ) }>
                        <Eye /> Details
                      </Button>
                      { isAdmin && entry.status === "submitted" && (
                        <Button size="sm" onClick={ () => handleConfirm( entry._id! ) }>
                          <CheckCheck /> Confirm
                        </Button>
                      ) }
                      { isAdmin && entry.status !== "open" && (
                        <Button size="sm" variant="ghost" onClick={ () => handleUnlock( entry._id! ) }>
                          <Unlock /> Unlock
                        </Button>
                      ) }
                    </div>
                  </div>
                </Card>
              )
            } ) }
          </div>
        </section>
      </main>

      { selectedEntry && (
        <AdminEntryDetailModal
          entry={ selectedEntry }
          onClose={ () => setSelectedEntry( null ) }
          readOnly={ !isAdmin }
          onConfirm={ () => handleConfirm( selectedEntry._id! ) }
          onUpdate={ async () =>
          {
            const fresh = await getAllEntries( selectedDate )
            setEntries( fresh )
            setSelectedEntry(
              fresh.find( e => e._id === selectedEntry._id ) ?? null
            )
          } }
        />
      ) }
    </div>
  )
}

/* ================= SMALL UI ================= */

const money2 = ( n: number ) =>
  n.toLocaleString( "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 } )

const Legend = ( { color, label, value }: { color: string; label: string; value: number } ) => (
  <div>
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={ `size-2 rounded-sm ${ color }` } />
      { label }
    </div>
    <div className="mt-0.5 font-medium">₹{ money2( value ) }</div>
  </div>
)

const Mini = ( {
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "danger"
} ) => (
  <Card className="px-4 py-3">
    <div className="text-xs text-muted-foreground">{ label }</div>
    <div className={ `mt-0.5 text-base font-semibold ${ tone === "danger" ? "text-danger" : "" }` }>
      ₹{ money2( value ) }
    </div>
  </Card>
)

const Metric = ( { label, value, strong }: { label: string; value: string; strong?: boolean } ) => (
  <div>
    <dt className="text-xs text-muted-foreground">{ label }</dt>
    <dd className={ strong ? "text-base font-semibold" : "font-medium" }>{ value }</dd>
  </div>
)
