"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getAllEntries, confirmEntry, unlockEntry } from "@/app/actions/admin"
import type { User } from "@/lib/auth"
import type { DayEntry } from "@/lib/types"
import { calculateTotalPayments, calculateCashSales } from "@/lib/types"
import
{
  LogOut,
  CheckCircle,
  Unlock,
  Calendar,
  AlertCircle,
  KeyRound,
} from "lucide-react"
import AdminEntryDetailModal from "./admin-entry-detail-modal"
import { useRouter } from "next/navigation"

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

  /* =====================================================
     ✅ FIX: DEDUPE BY COUNTER + DATE (UI UNCHANGED)
     ===================================================== */
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

      const existing = map.get( key )!

      const rank = ( e: DayEntry ) =>
        e.status === "confirmed" ? 3 : e.status === "submitted" ? 2 : 1

      if ( rank( entry ) > rank( existing ) )
      {
        map.set( key, entry )
      }
    }

    return Array.from( map.values() )
  }, [ entries ] )

  /* ===================================================== */

  const handleDateChange = async ( date: string ) =>
  {
    setSelectedDate( date )
    const updated = await getAllEntries( date )
    setEntries( updated )
  }

  const handleConfirm = async ( id: string ) =>
  {
    if ( confirm( "Confirm this entry? The day will be finalized." ) )
    {
      await confirmEntry( id )
      const updated = await getAllEntries( selectedDate )
      setEntries( updated )
    }
  }

  const handleUnlock = async ( id: string ) =>
  {
    if ( confirm( "Unlock this entry? Counter will be able to edit again." ) )
    {
      await unlockEntry( id )
      const updated = await getAllEntries( selectedDate )
      setEntries( updated )
    }
  }

  const calculateSummary = () =>
  {
    let totalCashSales = 0
    let totalCardUpi = 0
    let totalCredit = 0
    let totalPayments = 0
    let totalShortage = 0

    uniqueEntries.forEach( ( entry ) =>
    {
      const payments = calculateTotalPayments( entry.payments )
      totalPayments += payments

      const isFashionBoth = entry.counterName === "Smart Fashion (Both)"

      totalCashSales += calculateCashSales( entry.sales, isFashionBoth )

      totalCardUpi += isFashionBoth
        ? ( entry.sales.martCardUpi || 0 ) +
        ( entry.sales.fashionCardUpi || 0 )
        : entry.sales.cardUpiSales || 0

      totalCredit += isFashionBoth
        ? ( entry.sales.martCredit || 0 ) +
        ( entry.sales.fashionCredit || 0 )
        : entry.sales.creditSales || 0

      if ( entry.status !== "open" )
      {
        totalShortage += entry.submittedShortage || 0
      }
    } )

    return {
      totalCashSales,
      totalCardUpi,
      totalCredit,
      totalPayments,
      totalShortage,
      totalSales: totalCashSales + totalCardUpi + totalCredit,
    }
  }

  const summary = calculateSummary()

  /* ===================================================== */

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */ }
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Smart Mart & Smart Fashions
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <Input
              type="date"
              value={ selectedDate }
              onChange={ ( e ) => handleDateChange( e.target.value ) }
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

      {/* MAIN */ }
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* SUMMARY */ }
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Sales</div>
            <div className="text-2xl font-bold">
              ₹{ summary.totalSales.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Cash Sales</div>
            <div className="text-2xl font-bold text-green-600">
              ₹{ summary.totalCashSales.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Card / UPI</div>
            <div className="text-2xl font-bold text-blue-600">
              ₹{ summary.totalCardUpi.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Credit</div>
            <div className="text-2xl font-bold text-yellow-600">
              ₹{ summary.totalCredit.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Payments</div>
            <div className="text-2xl font-bold text-red-600">
              ₹{ summary.totalPayments.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              { summary.totalShortage > 0
                ? "Shortage"
                : summary.totalShortage < 0
                  ? "Excess"
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
        </div>

        {/* COUNTER CARDS — ORIGINAL UI */ }
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Counter Status</h2>

          { uniqueEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              No entries found for this date
            </div>
          ) : (
            uniqueEntries.map( ( entry ) =>
            {
              const payments = calculateTotalPayments( entry.payments )
              const isFashionBoth =
                entry.counterName === "Smart Fashion (Both)"
              const cashSales = calculateCashSales(
                entry.sales,
                isFashionBoth
              )

              const expected =
                entry.status !== "open"
                  ? entry.submittedExpectedCash || 0
                  : 0

              const shortage =
                entry.status !== "open"
                  ? entry.submittedShortage || 0
                  : 0

              return (
                <div
                  key={ entry._id }
                  className="border border-border rounded-lg p-4 hover:border-primary transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">
                        { entry.counterName }
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Cash Sales:
                          </span>
                          <span className="ml-2 font-medium">
                            ₹{ cashSales.toFixed( 2 ) }
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            Payments:
                          </span>
                          <span className="ml-2 font-medium">
                            ₹{ payments.toFixed( 2 ) }
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            Expected:
                          </span>
                          <span className="ml-2 font-medium">
                            ₹{ expected.toFixed( 2 ) }
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground">
                            { shortage > 0
                              ? "Shortage:"
                              : shortage < 0
                                ? "Excess:"
                                : "Balanced:" }
                          </span>
                          <span
                            className={ `ml-2 font-medium ${ shortage > 0
                              ? "text-red-600"
                              : shortage < 0
                                ? "text-green-600"
                                : ""
                              }` }
                          >
                            ₹{ Math.abs( shortage ).toFixed( 2 ) }
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 ml-4">
                      <div
                        className={ `px-3 py-1 rounded-full text-sm font-medium ${ entry.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : entry.status === "submitted"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                          }` }
                      >
                        { entry.status === "confirmed"
                          ? "Confirmed"
                          : entry.status === "submitted"
                            ? "Submitted"
                            : "Open" }
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={ () => setSelectedEntry( entry ) }
                      >
                        View Details
                      </Button>

                      { entry.status === "submitted" && (
                        <Button
                          size="sm"
                          onClick={ () => handleConfirm( entry._id! ) }
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Confirm
                        </Button>
                      ) }

                      { entry.status !== "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={ () => handleUnlock( entry._id! ) }
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          Unlock
                        </Button>
                      ) }
                    </div>
                  </div>
                </div>
              )
            } )
          ) }
        </Card>
      </main>

      { selectedEntry && (
        <AdminEntryDetailModal
          entry={ selectedEntry }
          onClose={ () => setSelectedEntry( null ) }
          onUpdate={ async () =>
          {
            const updated = await getAllEntries( selectedDate )
            setEntries( updated )
          } }
        />
      ) }
    </div>
  )
}
