"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getAllEntries, confirmEntry, unlockEntry } from "@/app/actions/admin"
import type { User } from "@/lib/auth"
import type { DayEntry } from "@/lib/types"
import
{
  calculateCashSales,
  calculatePaymentSummary,
} from "@/lib/types"
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
    const updated = await getAllEntries( date )
    setEntries( updated )
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
    let totalPaymentsOut = 0
    let totalShortage = 0

    uniqueEntries.forEach( ( entry ) =>
    {
      const isBoth = entry.counterName === "Smart Fashion (Both)"
      const { totalOut } = calculatePaymentSummary( entry.payments )
      const cashSales = calculateCashSales( entry.sales, isBoth )

      totalCashSales += cashSales
      totalPaymentsOut += totalOut

      totalCardUpi += isBoth
        ? ( entry.sales.martCardUpi || 0 ) + ( entry.sales.fashionCardUpi || 0 )
        : entry.sales.cardUpiSales || 0

      totalCredit += isBoth
        ? ( entry.sales.martCredit || 0 ) + ( entry.sales.fashionCredit || 0 )
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
      totalPaymentsOut,
      totalShortage,
      totalSales: totalCashSales + totalCardUpi + totalCredit,
    }
  }, [ uniqueEntries ] )

  /* ================= RENDER ================= */
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */ }
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Smart Mart & Smart Fashions
            </p>
          </div>

          <div className="flex items-center gap-3">
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
            <div className="text-sm">Total Sales</div>
            <div className="text-2xl font-bold">
              ₹{ summary.totalSales.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm">Cash Sales</div>
            <div className="text-2xl font-bold text-green-600">
              ₹{ summary.totalCashSales.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm">Card / UPI</div>
            <div className="text-2xl font-bold text-blue-600">
              ₹{ summary.totalCardUpi.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm">Credit</div>
            <div className="text-2xl font-bold text-yellow-600">
              ₹{ summary.totalCredit.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm">Payments (OUT)</div>
            <div className="text-2xl font-bold text-red-600">
              ₹{ summary.totalPaymentsOut.toFixed( 2 ) }
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm">
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

        {/* COUNTER LIST */ }
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Counter Status</h2>

          { uniqueEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              No entries found
            </div>
          ) : (
            uniqueEntries.map( ( entry ) =>
            {
              const isBoth = entry.counterName === "Smart Fashion (Both)"
              const cashSales = calculateCashSales( entry.sales, isBoth )
              const { totalOut } = calculatePaymentSummary( entry.payments )

              const totalSales =
                cashSales +
                ( isBoth
                  ? ( entry.sales.martCardUpi || 0 ) +
                  ( entry.sales.fashionCardUpi || 0 ) +
                  ( entry.sales.martCredit || 0 ) +
                  ( entry.sales.fashionCredit || 0 )
                  : ( entry.sales.cardUpiSales || 0 ) +
                  ( entry.sales.creditSales || 0 ) )

              const shortage = entry.submittedShortage || 0

              return (
                <div
                  key={ entry._id }
                  className="border rounded-lg p-4 mb-3"
                >
                  <div className="flex justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">
                        { entry.counterName }
                      </h3>

                      {/* STATUS */ }
                      <div className="text-xs mt-1">
                        { entry.status === "open" && (
                          <span className="text-blue-600">● Open</span>
                        ) }
                        { entry.status === "submitted" && (
                          <span className="text-orange-600">● Submitted</span>
                        ) }
                        { entry.status === "confirmed" && (
                          <span className="text-green-600">● Confirmed</span>
                        ) }
                      </div>

                      {/* OPENING VERIFIED */ }
                      { entry.openingVerified && (
                        <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                          <CheckCircle className="w-4 h-4" />
                          Opening Verified
                          { entry.openingVerifiedAt && (
                            <span className="text-muted-foreground ml-1">
                              (
                              { new Date(
                                entry.openingVerifiedAt
                              ).toLocaleTimeString( "en-IN" ) }
                              )
                            </span>
                          ) }
                        </div>
                      ) }

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                        <div>Total Sales: ₹{ totalSales.toFixed( 2 ) }</div>
                        <div>Cash Sales: ₹{ cashSales.toFixed( 2 ) }</div>
                        <div>Payments (OUT): ₹{ totalOut.toFixed( 2 ) }</div>
                        <div
                          className={
                            shortage > 0
                              ? "text-red-600"
                              : shortage < 0
                                ? "text-green-600"
                                : ""
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
                    </div>

                    <div className="flex gap-3">
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
                          Confirm
                        </Button>
                      ) }

                      { entry.status !== "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={ () => handleUnlock( entry._id! ) }
                        >
                          <Unlock className="w-4 h-4 mr-1" />
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
            setEntries( await getAllEntries( selectedDate ) )
          }
        />
      ) }
    </div>
  )
}
