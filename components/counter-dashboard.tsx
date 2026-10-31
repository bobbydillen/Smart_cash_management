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
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  TrendingUp,
  ClipboardCheck,
} from "lucide-react"
import StatusChip from "./status-chip"
import { AppShell, type NavItem } from "./app-shell"
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

  const stepItems: NavItem[] = steps.map( step => ( {
    id: step.id,
    label: step.label,
    icon: step.icon,
    active: currentPage === step.id && !showOpening,
    disabled: mustVerifyFirst,
    hint: "Verify the opening cash first",
    onSelect: () =>
    {
      setShowOpening( false )
      setCurrentPage( step.id )
    },
  } ) )

  // the opening cash check can be looked at again at any time once it is done
  const secondaryItems: NavItem[] = mustVerifyFirst
    ? []
    : [
      {
        id: "opening",
        label: "Opening cash",
        icon: entry.openingVerified && openingTone !== "warning" ? ShieldCheck : ShieldAlert,
        active: showOpening,
        onSelect: () => setShowOpening( v => !v ),
      },
    ]

  const onOpening = mustVerifyFirst || showOpening
  const pageTitle = onOpening ? "Opening cash" : steps.find( x => x.id === currentPage )!.label
  const closingBar = !onOpening && currentPage === "closing" && !isReadOnly

  return (
    <AppShell
      nav={ stepItems }
      secondary={ secondaryItems }
      user={ { name: user.counterName || "Counter", role: "Counter", onLogout: () => logout() } }
      title={ pageTitle }
      subtitle={ `${ user.counterName } · ${ longDate }` }
      hasBottomBar={ closingBar }
      headerRight={
        <div className="flex items-center gap-2">
          { entry.status === "open" && <StatusChip tone="info">Day open</StatusChip> }
          { entry.status === "submitted" && <StatusChip tone="warning">Awaiting confirmation</StatusChip> }
          { entry.status === "confirmed" && <StatusChip tone="success">Confirmed</StatusChip> }
          { entry.openingVerified ? (
            <span className="hidden sm:inline-flex">
              <StatusChip tone={ openingTone }>{ openingTone === "warning" ? "Opening flagged" : "Opening verified" }</StatusChip>
            </span>
          ) : (
            entry.status === "open" && <StatusChip tone="danger">Opening not verified</StatusChip>
          ) }
        </div>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={ selectedDate }
            max={ today }
            onChange={ ( e ) => handleDateChange( e.target.value ) }
            className="h-10 w-auto text-sm"
            aria-label="Select date"
          />
          { entry.status === "open" && entry.date === today && entry.openingVerified && !isReadOnly && (
            <TransferButton refreshEntry={ refreshEntry } onClosed={ () => { refreshEntry() } } />
          ) }
        </div>
      }
    >
      <div key={ onOpening ? "opening" : currentPage } className="animate-in space-y-5 fade-in-0 duration-150">
        { entry.status === "open" && entry.date === today && (
          <IncomingTransfersBanner
            canAccept={ !!entry.openingVerified }
            refreshEntry={ refreshEntry }
          />
        ) }

        { onOpening && entry.openingDenominations && (
          <OpeningVerifyPage
            entry={ entry }
            isReadOnly={ isReadOnly }
            onVerify={ handleVerifyOpening }
            verifying={ verifyingOpening }
          />
        ) }

        { !onOpening && currentPage === "payments" && (
          <PaymentsPage
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
            onEntryPatch={ patch =>
              setEntry( prev => ( prev ? { ...prev, ...patch } : prev ) )
            }
          />
        ) }

        { !onOpening && currentPage === "sales" && (
          <SalesPage
            entry={ entry }
            isReadOnly={ isReadOnly }
            user={ user }
            onEntryPatch={ patch =>
              setEntry( prev => ( prev ? { ...prev, ...patch } : prev ) )
            }
          />
        ) }

        { !onOpening && currentPage === "closing" && (
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
      </div>
    </AppShell>
  )
}
