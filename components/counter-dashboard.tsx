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
import type { User } from "@/lib/auth"
import type { DayEntry } from "@/lib/types"
import { LogOut, CheckCircle, Calendar, AlertCircle } from "lucide-react"

import OpeningVerifyPage from "./pages/opening-verify-page"
import PaymentsPage from "./pages/payments-page"
import SalesPage from "./pages/sales-page"
import ClosingPage from "./pages/closing-page"

interface CounterDashboardProps
{
  user: User
  initialEntry: DayEntry | null
  isAdminView?: boolean
}

export default function CounterDashboard ( {
  user,
  initialEntry,
  isAdminView = false,
}: CounterDashboardProps )
{
  const today = new Date().toISOString().split( "T" )[ 0 ]

  const [ entry, setEntry ] = useState<DayEntry | null>( initialEntry )
  const [ currentPage, setCurrentPage ] = useState<
    "payments" | "sales" | "closing"
  >( "payments" )
  const [ selectedDate, setSelectedDate ] = useState( today )
  const [ verifyingOpening, setVerifyingOpening ] = useState( false )
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

  const handleVerifyOpening = async () =>
  {
    if ( !entry || isAdminView ) return
    setVerifyingOpening( true )
    await verifyOpeningCash( selectedDate )
    await refreshEntry()
    setVerifyingOpening( false )
  }

  /* ================= AUTO REFRESH (COUNTER ONLY) ================= */

  useEffect( () =>
  {
    if ( isAdminView ) return

    const interval = setInterval( async () =>
    {
      const updated = await getEntryByDate( selectedDate )
      setEntry( updated )
    }, 30000 )

    return () => clearInterval( interval )
  }, [ selectedDate, isAdminView ] )

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
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if ( !entry ) return null

  /* ================= READ ONLY LOGIC ================= */

  const isReadOnly = isAdminView || entry.status !== "open"

  return (
    <div className="min-h-screen bg-background">
      {/* ================= HEADER ================= */ }
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              { user.counterName }
            </h1>
            <p className="text-sm text-muted-foreground">
              { new Date( selectedDate ).toLocaleDateString( "en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              } ) }
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <Input
                type="date"
                value={ selectedDate }
                max={ today }
                onChange={ ( e ) => handleDateChange( e.target.value ) }
              />
            </div>

            { entry.openingVerified && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Opening Verified
                </span>
              </div>
            ) }

            { entry.status === "submitted" && (
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">
                  Awaiting Admin Confirmation
                </span>
              </div>
            ) }

            { entry.status === "confirmed" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Confirmed</span>
              </div>
            ) }

            { !isAdminView && (
              <Button onClick={ () => logout() } variant="outline" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            ) }
          </div>
        </div>

        {/* ================= ADMIN BANNER ================= */ }
        { isAdminView && (
          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-sm font-semibold">
            🔒 ADMIN VIEW — READ ONLY
          </div>
        ) }

        {/* ================= PAGE NAV ================= */ }
        <div className="flex gap-2 px-4 pb-2">
          <Button
            variant={ currentPage === "payments" ? "default" : "outline" }
            onClick={ () => setCurrentPage( "payments" ) }
            className="flex-1"
            size="sm"
          >
            1. Payments
          </Button>
          <Button
            variant={ currentPage === "sales" ? "default" : "outline" }
            onClick={ () => setCurrentPage( "sales" ) }
            className="flex-1"
            size="sm"
          >
            2. Sales
          </Button>
          <Button
            variant={ currentPage === "closing" ? "default" : "outline" }
            onClick={ () => setCurrentPage( "closing" ) }
            className="flex-1"
            size="sm"
          >
            3. Closing
          </Button>
        </div>
      </header>

      {/* ================= MAIN ================= */ }
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        { !isAdminView &&
          entry.status === "open" &&
          !entry.openingVerified &&
          entry.openingDenominations && (
            <OpeningVerifyPage
              entry={ entry }
              isReadOnly={ isReadOnly }
              onVerify={ handleVerifyOpening }
              verifying={ verifyingOpening }
            />
          ) }

        { currentPage === "payments" && (
          <PaymentsPage
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
          />
        ) }

        { currentPage === "sales" && (
          <SalesPage
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
            user={ user }
          />
        ) }

        { currentPage === "closing" && (
          <ClosingPage
            entry={ entry }
            refreshEntry={ refreshEntry }
            isReadOnly={ isReadOnly }
            user={ user }
          />
        ) }
      </main>
    </div>
  )
}
