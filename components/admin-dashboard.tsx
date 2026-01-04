"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getAllEntries, confirmEntry, unlockEntry } from "@/app/actions/admin"
import type { User } from "@/lib/auth"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateCashSales,
  calculatePaymentSummary,
  calculateClosingCash,
} from "@/lib/types"
import { LogOut, Unlock, Calendar, KeyRound } from "lucide-react"
import AdminEntryDetailModal from "./admin-entry-detail-modal"
import { useRouter } from "next/navigation"

/* ================= HELPERS ================= */

const EMPTY_DENOMS: DenominationCount = {
  notes500: 0,
  notes200: 0,
  notes100: 0,
  notes50: 0,
  notes20: 0,
  notes10: 0,
  coins10: 0,
  coins5: 0,
  coins2: 0,
  coins1: 0,
}

const subtractDenoms = (
  closing: DenominationCount,
  nextDay?: DenominationCount
) =>
{
  const r = { ...EMPTY_DENOMS }
    ; ( Object.keys( r ) as ( keyof DenominationCount )[] ).forEach( k =>
    {
      r[ k ] = Math.max( 0, closing[ k ] - ( nextDay?.[ k ] || 0 ) )
    } )
  return r
}

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
  user: User
  initialEntries: DayEntry[]
}

export default function AdminDashboard ( {
  user,
  initialEntries,
}: AdminDashboardProps )
{
  const router = useRouter()
  const [ entries, setEntries ] = useState<DayEntry[]>( initialEntries )
  const [ selectedDate, setSelectedDate ] = useState(
    new Date().toISOString().split( "T" )[ 0 ]
  )
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
      setEntries( await getAllEntries( selectedDate ) )
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

  /* ================= SUMMARY ================= */

  const summary = useMemo( () =>
  {
    let totalCashSales = 0
    let totalCardUpi = 0
    let totalCredit = 0
    let totalAvailableCash = 0
    let totalShortage = 0

    let smartMartTotal = 0
    let smartFashionTotal = 0
    let smartFancyTotal = 0

    uniqueEntries.forEach( entry =>
    {
      const isBoth = entry.counterName === "Smart Fashion (Both)"
      const cashSales = calculateCashSales( entry.sales, isBoth )

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
      totalAvailableCash,
      totalShortage,
      smartMartTotal,
      smartFashionTotal,
      smartFancyTotal,
    }
  }, [ uniqueEntries ] )

  /* ================= RENDER ================= */

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Smart Mart & Smart Fashions
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <Calendar className="w-5 h-5" />
            <Input
              type="date"
              value={ selectedDate }
              onChange={ e => handleDateChange( e.target.value ) }
            />

            <Button
              variant="outline"
              size="sm"
              onClick={ () => router.push( "/admin/passwords" ) }
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Passwords
            </Button>

            <Button variant="outline" size="sm" onClick={ () => logout() }>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* TOTAL SALES */ }
        <Card className="p-6 text-center">
          <div className="text-sm text-muted-foreground">Total Sales</div>
          <div className="text-4xl font-extrabold mt-1">
            ₹{ summary.totalSales.toFixed( 2 ) }
          </div>
        </Card>

        {/* BUSINESS BREAKUP */ }
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Smart Mart Total" value={ summary.smartMartTotal } />
          <Stat label="Smart Fashion Total" value={ summary.smartFashionTotal } />
          <Stat label="Smart Mart Fancy Total" value={ summary.smartFancyTotal } />
        </div>

        {/* CASH BREAKUP */ }
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Cash Sales" value={ summary.totalCashSales } green />
          <Stat label="Card / UPI" value={ summary.totalCardUpi } blue />
          <Stat label="Credit" value={ summary.totalCredit } yellow />
          <Stat label="Available Cash" value={ summary.totalAvailableCash } />
        </div>

        {/* SHORTAGE */ }
        <Card className="p-4 text-center">
          <div className="text-sm">
            { summary.totalShortage > 0
              ? "Total Shortage"
              : summary.totalShortage < 0
                ? "Total Excess"
                : "Balanced" }
          </div>
          <div
            className={ `text-2xl font-bold ${ summary.totalShortage > 0
              ? "text-red-600"
              : summary.totalShortage < 0
                ? "text-green-600"
                : ""
              }` }
          >
            ₹{ Math.abs( summary.totalShortage ).toFixed( 2 ) }
          </div>
        </Card>

        {/* COUNTER STATUS */ }
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Counter Status</h2>

          { uniqueEntries.map( entry =>
          {
            const isBoth = entry.counterName === "Smart Fashion (Both)"
            const cashSales = calculateCashSales( entry.sales, isBoth )
            const { totalOut } = calculatePaymentSummary( entry.payments )

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

            const totalSales = cashSales + card + credit
            const shortage = entry.submittedShortage || 0

            return (
              <div key={ entry._id } className="border rounded-lg p-4 mb-3">
                <h3 className="font-semibold">{ entry.counterName }</h3>

                {/* ENTRY STATUS */ }
                <div className="text-xs mt-1">
                  { entry.status === "open" && (
                    <span className="text-blue-600 font-medium">● Open</span>
                  ) }
                  { entry.status === "submitted" && (
                    <span className="text-orange-600 font-medium">
                      ● Submitted
                    </span>
                  ) }
                  { entry.status === "confirmed" && (
                    <span className="text-green-600 font-medium">
                      ● Confirmed
                    </span>
                  ) }
                </div>

                {/* OPENING VERIFIED */ }
                <div className="text-xs mt-1">
                  Opening:
                  { entry.openingVerified ? (
                    <span className="text-green-600 font-medium">
                      { " " }VERIFIED at { formatTime( entry.openingVerifiedAt ) }
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium">
                      { " " }NOT VERIFIED
                    </span>
                  ) }
                </div>

                {/* DETAILS GRID (RESTORED) */ }
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-3 text-sm">
                  <div>Total Sales: ₹{ totalSales.toFixed( 2 ) }</div>
                  <div>Cash Sales: ₹{ cashSales.toFixed( 2 ) }</div>
                  <div>Payments OUT: ₹{ totalOut.toFixed( 2 ) }</div>
                  <div>Available Cash: ₹{ availableCash.toFixed( 2 ) }</div>
                  <div
                    className={
                      shortage > 0
                        ? "text-red-600 font-semibold"
                        : shortage < 0
                          ? "text-green-600 font-semibold"
                          : "font-semibold"
                    }
                  >
                    { shortage > 0
                      ? "Shortage"
                      : shortage < 0
                        ? "Excess"
                        : "Balanced" }{ " " }
                    ₹{ Math.abs( shortage ).toFixed( 2 ) }
                  </div>
                </div>

                <div className="flex gap-3 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={ () => setSelectedEntry( entry ) }
                  >
                    View Details
                  </Button>

                  { entry.status === "submitted" && (
                    <Button
                      size="sm"
                      onClick={ () => handleConfirm( entry._id! ) }
                    >
                      Confirm
                    </Button>
                  ) }

                  { entry.status !== "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={ () => handleUnlock( entry._id! ) }
                    >
                      <Unlock className="w-4 h-4 mr-1" />
                      Unlock
                    </Button>
                  ) }
                </div>
              </div>
            )
          } ) }
        </Card>
      </main>

      { selectedEntry && (
        <AdminEntryDetailModal
          entry={ selectedEntry }
          onClose={ () => setSelectedEntry( null ) }
          onUpdate={ async () =>
            setEntries( await getAllEntries( selectedDate ) )
          }
        />
      ) }
    </div>
  )
}

/* ================= SMALL UI ================= */

const Stat = ( {
  label,
  value,
  green,
  blue,
  yellow,
}: any ) => (
  <Card className="p-4">
    <div className="text-sm">{ label }</div>
    <div
      className={ `text-2xl font-bold ${ green
        ? "text-green-600"
        : blue
          ? "text-blue-600"
          : yellow
            ? "text-yellow-600"
            : ""
        }` }
    >
      ₹{ value.toFixed( 2 ) }
    </div>
  </Card>
)
