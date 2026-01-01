"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import
{
  updateSales,
  getOpeningCashForDate,
} from "@/app/actions/counter"
import type { DayEntry, SalesData } from "@/lib/types"
import type { User } from "@/lib/auth"
import
{
  calculateCashSales,
  calculatePaymentSummary,
} from "@/lib/types"
import { AlertCircle } from "lucide-react"

interface SalesPageProps
{
  entry: DayEntry
  refreshEntry: () => Promise<void> // kept for date switch
  isReadOnly: boolean
  user: User
}

export default function SalesPage ( {
  entry,
  refreshEntry,
  isReadOnly,
  user,
}: SalesPageProps )
{

  const isFashionBoth = user.counterName === "Smart Fashion (Both)"

  /* ================= STATE ================= */

  // editing state
  const [ sales, setSales ] = useState<SalesData>( entry.sales )
  const [ inputs, setInputs ] = useState<Record<string, string>>( {} )
  const [ hasUnsavedChanges, setHasUnsavedChanges ] = useState( false )

  // ✅ saved snapshot (used for expected cash)
  const [ savedSales, setSavedSales ] = useState<SalesData>( entry.sales )

  // opening cash
  const [ openingCash, setOpeningCash ] = useState( 0 )

  /* ================= SYNC ON DATE CHANGE ================= */

  useEffect( () =>
  {
    setSales( entry.sales )
    setSavedSales( entry.sales ) // ✅ sync saved snapshot
    setInputs( {} )
    setHasUnsavedChanges( false )
  }, [ entry.date ] )

  /* ================= OPENING CASH ================= */

  useEffect( () =>
  {
    getOpeningCashForDate( entry.date ).then( res =>
    {
      if ( !res?.error && typeof res.cash === "number" )
      {
        setOpeningCash( res.cash )
      }
    } )
  }, [ entry.date, entry.updatedAt ] )

  /* ================= HANDLERS ================= */

  const handleChange = ( key: keyof SalesData, value: string ) =>
  {
    setInputs( prev => ( { ...prev, [ key ]: value } ) )
    setSales( prev => ( {
      ...prev,
      [ key ]: value === "" ? 0 : Number( value ),
    } ) )
    setHasUnsavedChanges( true )
  }

  const handleSave = async () =>
  {
    await updateSales( sales, entry.date )

    // ✅ instant UI update (NO refresh needed)
    setSavedSales( sales )
    setHasUnsavedChanges( false )
  }

  /* ================= CALCULATIONS ================= */

  const previewCashSales = calculateCashSales( sales, isFashionBoth )
  const savedCashSales = calculateCashSales( savedSales, isFashionBoth )

  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash =
    openingCash + savedCashSales + totalIn - totalOut

  /* ================= JSX ================= */

  return (
    <div className="space-y-6">

      {/* UNSAVED WARNING */ }
      { hasUnsavedChanges && (
        <Card className="p-4 border-orange-500 bg-orange-50">
          <div className="flex items-center gap-2 text-orange-700">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">
              You have unsaved changes. Click “Save Sales”.
            </span>
          </div>
        </Card>
      ) }

      {/* SALES ENTRY */ }
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">
          Sales Entry (End of Day)
        </h2>

        { !isFashionBoth ? (
          <div className="space-y-4">

            <div>
              <label className="text-sm font-medium mb-1 block">
                Total Sales
              </label>
              <Input
                type="number"
                value={ inputs.totalSales ?? sales.totalSales.toString() }
                onChange={ e =>
                  handleChange( "totalSales", e.target.value )
                }
                disabled={ isReadOnly }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Card / UPI
              </label>
              <Input
                type="number"
                value={ inputs.cardUpiSales ?? sales.cardUpiSales.toString() }
                onChange={ e =>
                  handleChange( "cardUpiSales", e.target.value )
                }
                disabled={ isReadOnly }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Credit Sales
              </label>
              <Input
                type="number"
                value={ inputs.creditSales ?? sales.creditSales.toString() }
                onChange={ e =>
                  handleChange( "creditSales", e.target.value )
                }
                disabled={ isReadOnly }
              />
            </div>

            <div className="bg-secondary p-4 rounded-lg">
              <div className="flex justify-between font-bold">
                <span>Cash Sales (Preview)</span>
                <span>₹{ previewCashSales.toFixed( 2 ) }</span>
              </div>
            </div>

          </div>
        ) : (
          <div className="space-y-6">

            {/* SMART MART */ }
            <div>
              <h3 className="font-semibold mb-3">Smart Mart</h3>
              <div className="space-y-3">
                <Input
                  type="number"
                  value={ inputs.martTotalSales ?? ( sales.martTotalSales ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "martTotalSales", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
                <Input
                  type="number"
                  value={ inputs.martCardUpi ?? ( sales.martCardUpi ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "martCardUpi", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
                <Input
                  type="number"
                  value={ inputs.martCredit ?? ( sales.martCredit ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "martCredit", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
              </div>
            </div>

            {/* SMART FASHION */ }
            <div>
              <h3 className="font-semibold mb-3">Smart Fashion</h3>
              <div className="space-y-3">
                <Input
                  type="number"
                  value={ inputs.fashionTotalSales ?? ( sales.fashionTotalSales ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "fashionTotalSales", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
                <Input
                  type="number"
                  value={ inputs.fashionCardUpi ?? ( sales.fashionCardUpi ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "fashionCardUpi", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
                <Input
                  type="number"
                  value={ inputs.fashionCredit ?? ( sales.fashionCredit ?? 0 ).toString() }
                  onChange={ e =>
                    handleChange( "fashionCredit", e.target.value )
                  }
                  disabled={ isReadOnly }
                />
              </div>
            </div>

            <div className="bg-secondary p-4 rounded-lg">
              <div className="flex justify-between font-bold">
                <span>Total Cash Sales</span>
                <span>₹{ previewCashSales.toFixed( 2 ) }</span>
              </div>
            </div>

          </div>
        ) }

        { !isReadOnly && (
          <Button
            onClick={ handleSave }
            disabled={ !hasUnsavedChanges }
            className="w-full mt-4"
          >
            { hasUnsavedChanges ? "Save Sales" : "Saved ✓" }
          </Button>
        ) }
      </Card>

      {/* EXPECTED CASH */ }
      <Card className="p-6">
        <h3 className="font-semibold mb-4">
          Expected Cash (Saved)
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Opening Cash</span>
            <span>₹{ openingCash.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>+ Cash Sales</span>
            <span>₹{ savedCashSales.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>+ Money In</span>
            <span>₹{ totalIn.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>- Money Out</span>
            <span>₹{ totalOut.toFixed( 2 ) }</span>
          </div>

          <div className="border-t pt-2 flex justify-between font-bold">
            <span>Expected Cash</span>
            <span className="text-primary text-lg">
              ₹{ expectedCash.toFixed( 2 ) }
            </span>
          </div>
        </div>
      </Card>

    </div>
  )
}
