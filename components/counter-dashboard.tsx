"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import
{
  getEntryByDate,
  verifyOpeningCash,
} from "@/app/actions/counter"
import type { SerializedUser } from "@/lib/session"
import type { DayEntry } from "@/lib/types"
import {
  LogOut,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  TrendingUp,
  ClipboardCheck,
} from "lucide-react"
import StatusChip from "./status-chip"
import { todayIST } from "@/lib/report"

import OpeningVerifyPage from "./pages/opening-verify-page"
import PaymentsPage from "./pages/payments-page"
import SalesPage from "./pages/sales-page"
import ClosingPage from "./pages/closing-page"
import IncomingTransfersBanner from "./incoming-transfers-banner"
import TransferButton from "./transfer-button"

interface CounterDashboardProps
{
  user: SerializedUser
  initialEntry: DayEntry | null
}

export default function CounterDashboard ( {
  user,
  initialEntry,
}: CounterDashboardProps )
{
  const today = todayIST()

  const [ entry, setEntry ] = useState<DayEntry | null>( initialEntry )
  const [ currentPage, setCurrentPage ] = useState<
    "payments" | "sales" | "closing"
  >( "payments" )
  const [ selectedDate, setSelectedDate ] = useState( today )
  const [ verifyingOpening, setVerifyingOpening ] = useState( false )
  const [ showOpening, setShowOpening ] = useState( false )
  const [ loading, setLoading ] = useState( false )

  /* ================= DATA ================= */

  const refreshEntry = async () =>
  {
    setLoading( true )
    const updated = await getEntryByDate( selectedDate )
    setEntry( updated )
    setLoading( false )
  }

  const handleDateChange = async ( date: string ) =>
  {
    setSelectedDate( date )
    setLoading( true )
    const updated = await getEntryByDate( date )
    setEntry( updated )
    setLoading( false )
  }

  /* ================= OPENING VERIFY ================= */

  const handleVerifyOpening = async (
    verifiedBy: string,
    checked: string[],
    status: "verified" | "not_verified",
    note: string
  ): Promise<string | null> =>
  {
    if ( !entry ) return null
    setVerifyingOpening( true )
    const res = await verifyOpeningCash(
      selectedDate,
      verifiedBy,
      checked,
      status,
      note
    )
    if ( res.error )
    {
      setVerifyingOpening( false )
      return res.error
    }
    await refreshEntry()
    setShowOpening( false )
    setVerifyingOpening( false )
    return null
  }

  /* ================= AUTO REFRESH  ================= */

  useEffect( () =>
  {
    const interval = setInterval( async () =>
    {
      const updated = await getEntryByDate( selectedDate )
      setEntry( updated )
    }, 30000 )

    return () => clearInterval( interval )
  }, [ selectedDate ] )

  /* ================= EMPTY DATE ================= */

  if ( !loading && !entry )
  {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            No entry found for this date
          </h2>
          <p className="text-sm text-muted-foreground">
            There was no counter activity recorded on the selected date.
          </p>
          <Button
            variant="outline"
            onClick={ () =>
            {
              setSelectedDate( today )
              setEntry( initialEntry )
            } }
          >
            Go back to today
          </Button>
        </div>
      </div>
    )
  }

  if ( loading )
  {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        Loading…
      </div>
    )
  }

  if ( !entry ) return null

  /* ================= READ ONLY LOGIC ================= */

  const isReadOnly = entry.status !== "open"

  // Counter must verify opening cash before any other entry
  const mustVerifyFirst =
    entry.status === "open" && !entry.openingVerified

  const longDate = new Date( selectedDate + "T00:00:00" ).toLocaleDateString( "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  } )

  const openingTone =
    entry.openingVerifyStatus === "not_verified" ? "warning" : "success"

  const steps = [
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "sales", label: "Sales", icon: TrendingUp },
    { id: "closing", label: "Closing", icon: ClipboardCheck },
  ] as const

  return (
    <div className="min-h-screen bg-background">
      {/* ================= HEADER ================= */ }
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
                { ( user.counterName || "C" ).replace( /^Smart /, "" ).charAt( 0 ) }
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight">
                  { user.counterName }
                </h1>
                <p className="truncate text-xs text-muted-foreground">{ longDate }</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              { !mustVerifyFirst && (
                <Button
                  variant={ showOpening ? "default" : "outline" }
                  size="sm"
                  onClick={ () => setShowOpening( v => !v ) }
                  aria-label="Opening cash"
                >
                  { entry.openingVerified ? (
                    openingTone === "warning" ? (
                      <ShieldAlert className="text-warning" />
                    ) : (
                      <ShieldCheck className="text-success" />
                    )
                  ) : (
                    <ShieldAlert />
                  ) }
                  <span className="hidden sm:inline">Opening cash</span>
                </Button>
              ) }
              <Button
                onClick={ () => logout() }
                variant="ghost"
                size="icon"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut />
              </Button>
            </div>
          </div>

          {/* status + date */ }
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              { entry.status === "open" && <StatusChip tone="info">Day open</StatusChip> }
              { entry.status === "submitted" && (
                <StatusChip tone="warning">Awaiting admin confirmation</StatusChip>
              ) }
              { entry.status === "confirmed" && (
                <StatusChip tone="success">Confirmed</StatusChip>
              ) }
              { entry.openingVerified ? (
                <StatusChip tone={ openingTone }>
                  { openingTone === "warning" ? "Opening flagged" : "Opening verified" }
                </StatusChip>
              ) : (
                entry.status === "open" && (
                  <StatusChip tone="danger">Opening not verified</StatusChip>
                )
              ) }
            </div>

            <div className="flex items-center gap-2">
            { entry.status === "open" && entry.date === today && entry.openingVerified && !isReadOnly && (
              <TransferButton refreshEntry={ refreshEntry } onClosed={ () => { refreshEntry() } } />
            ) }
            <Input
              type="date"
              value={ selectedDate }
              max={ today }
              onChange={ ( e ) => handleDateChange( e.target.value ) }
              className="h-9 w-auto text-sm"
              aria-label="Select date"
            />
            </div>
          </div>

          {/* steps */ }
          <nav className="grid grid-cols-3 gap-1.5 pb-3" aria-label="Day steps">
            { steps.map( ( step, i ) =>
            {
              const active = currentPage === step.id && !showOpening
              const Icon = step.icon
              return (
                <button
                  key={ step.id }
                  disabled={ mustVerifyFirst }
                  onClick={ () =>
                  {
                    setShowOpening( false )
                    setCurrentPage( step.id )
                  } }
                  className={ `flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }` }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="hidden min-[400px]:inline">{ i + 1 }.</span>
                  { step.label }
                </button>
              )
            } ) }
          </nav>
        </div>
      </header>

      {/* ================= MAIN ================= */ }
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 pb-24">
        { entry.status === "open" && entry.date === today && (
          <IncomingTransfersBanner
            canAccept={ !!entry.openingVerified }
            refreshEntry={ refreshEntry }
          />
        ) }

        { ( mustVerifyFirst || showOpening ) && entry.openingDenominations && (
          <OpeningVerifyPage
            entry={ entry }
            isReadOnly={ isReadOnly }
            onVerify={ handleVerifyOpening }
            verifying={ verifyingOpening }
          />
        ) }

        { !mustVerifyFirst && !showOpening && currentPage === "payments" && (
          <PaymentsPage
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
            onEntryPatch={ patch =>
              setEntry( prev => ( prev ? { ...prev, ...patch } : prev ) )
            }
          />
        ) }

        { !mustVerifyFirst && !showOpening && currentPage === "sales" && (
          <SalesPage
            entry={ entry }
            isReadOnly={ isReadOnly }
            user={ user }
            onEntryPatch={ patch =>
              setEntry( prev => ( prev ? { ...prev, ...patch } : prev ) )
            }
          />
        ) }

        { !mustVerifyFirst && !showOpening && currentPage === "closing" && (
          <ClosingPage
            key={ entry.date }
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
            user={ user }
            onEntryPatch={ patch =>
              setEntry( prev => ( prev ? { ...prev, ...patch } : prev ) )
            }
          />
        ) }
      </main>
    </div>
  )
}
