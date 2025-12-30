"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateTotalPayments,
  calculateExpectedCash,
  calculateClosingCash,
} from "@/lib/types"
import { X } from "lucide-react"
import
{
  updateEntryOpeningCash,
  updateEntryClosingCash,
} from "@/app/actions/admin"

interface AdminEntryDetailModalProps
{
  entry: DayEntry
  onClose: () => void
  onUpdate: () => void
}

export default function AdminEntryDetailModal ( {
  entry,
  onClose,
  onUpdate,
}: AdminEntryDetailModalProps )
{
  const [ openingCash, setOpeningCash ] = useState( entry.openingCash )
  const [ denominations, setDenominations ] = useState<DenominationCount>(
    entry.closingDenominations
  )

  /* =====================================================
     ✅ CORRECT CASH SALES CALCULATION
     ===================================================== */
  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"

  let totalCashSales = 0

  if ( isFashionBoth )
  {
    const martCash =
      ( entry.sales.martTotalSales || 0 ) -
      ( entry.sales.martCardUpi || 0 ) -
      ( entry.sales.martCredit || 0 )

    const fashionCash =
      ( entry.sales.fashionTotalSales || 0 ) -
      ( entry.sales.fashionCardUpi || 0 ) -
      ( entry.sales.fashionCredit || 0 )

    totalCashSales = martCash + fashionCash
  } else
  {
    totalCashSales =
      ( entry.sales.totalSales || 0 ) -
      ( entry.sales.cardUpiSales || 0 ) -
      ( entry.sales.creditSales || 0 )
  }

  /* ===================================================== */

  const totalPayments = calculateTotalPayments( entry.payments )
  const expectedCash = calculateExpectedCash(
    openingCash,
    totalCashSales,
    totalPayments
  )
  const actualCash = calculateClosingCash( denominations )
  const shortage = expectedCash - actualCash

  const handleUpdateOpening = async () =>
  {
    await updateEntryOpeningCash( entry._id!, openingCash )
    onUpdate()
  }

  const handleUpdateClosing = async () =>
  {
    await updateEntryClosingCash( entry._id!, denominations )
    onUpdate()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* HEADER */ }
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{ entry.counterName }</h2>
            <p className="text-sm text-muted-foreground">
              { new Date( entry.date ).toLocaleDateString( "en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              } ) }
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={ onClose }>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* PAYMENTS */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Payments</h3>
            <div className="space-y-2">
              { entry.payments.map( ( payment, index ) => (
                <div
                  key={ index }
                  className="flex justify-between p-3 bg-secondary rounded-lg"
                >
                  <div>
                    <div className="font-medium">{ payment.description }</div>
                    <div className="text-sm text-muted-foreground">
                      { new Date( payment.time ).toLocaleTimeString( "en-IN" ) }
                    </div>
                  </div>
                  <div className="text-lg font-bold">
                    ₹{ payment.amount.toFixed( 2 ) }
                  </div>
                </div>
              ) ) }
              <div className="bg-primary/10 p-4 rounded-lg flex justify-between">
                <span className="font-medium">Total Payments</span>
                <span className="text-2xl font-bold text-primary">
                  ₹{ totalPayments.toFixed( 2 ) }
                </span>
              </div>
            </div>
          </Card>

          {/* OPENING CASH */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">
              Opening Cash (Admin Can Override)
            </h3>
            <div className="flex gap-3 items-end">
              <Input
                type="number"
                value={ openingCash }
                onChange={ ( e ) =>
                  setOpeningCash( Number.parseFloat( e.target.value ) || 0 )
                }
              />
              <Button onClick={ handleUpdateOpening }>
                Update Opening
              </Button>
            </div>
          </Card>

          {/* CLOSING CASH */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">
              Closing Cash (Admin Can Edit)
            </h3>

            <div className="grid grid-cols-4 gap-3">
              { [
                [ "₹500", "notes500" ],
                [ "₹200", "notes200" ],
                [ "₹100", "notes100" ],
                [ "₹50", "notes50" ],
                [ "₹20", "notes20" ],
                [ "₹10", "notes10" ],
                [ "₹10 coin", "coins10" ],
                [ "₹5 coin", "coins5" ],
                [ "₹2 coin", "coins2" ],
                [ "₹1 coin", "coins1" ],
              ].map( ( [ label, key ] ) => (
                <div key={ key }>
                  <label className="text-sm font-medium">{ label }</label>
                  <Input
                    type="number"
                    value={ denominations[ key as keyof DenominationCount ] }
                    onChange={ ( e ) =>
                      setDenominations( {
                        ...denominations,
                        [ key ]: Number.parseInt( e.target.value ) || 0,
                      } )
                    }
                  />
                </div>
              ) ) }
            </div>

            <Button className="mt-4" onClick={ handleUpdateClosing }>
              Update Closing Cash
            </Button>
          </Card>

          {/* CASH RECONCILIATION */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Cash Reconciliation</h3>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Opening Cash</span>
                <span className="font-bold">
                  ₹{ openingCash.toFixed( 2 ) }
                </span>
              </div>

              <div className="flex justify-between text-green-600">
                <span>+ Cash Sales</span>
                <span className="font-bold">
                  ₹{ totalCashSales.toFixed( 2 ) }
                </span>
              </div>

              <div className="flex justify-between text-red-600">
                <span>- Payments</span>
                <span className="font-bold">
                  ₹{ totalPayments.toFixed( 2 ) }
                </span>
              </div>

              <div className="border-t pt-2 flex justify-between">
                <span className="font-bold">Expected Cash</span>
                <span className="text-xl font-bold">
                  ₹{ expectedCash.toFixed( 2 ) }
                </span>
              </div>

              <div className="flex justify-between">
                <span className="font-bold">Actual Cash</span>
                <span className="text-xl font-bold">
                  ₹{ actualCash.toFixed( 2 ) }
                </span>
              </div>

              <div
                className={ `border-t pt-2 flex justify-between ${ shortage > 0
                  ? "text-red-600"
                  : shortage < 0
                    ? "text-green-600"
                    : ""
                  }` }
              >
                <span className="text-xl font-bold">
                  { shortage > 0
                    ? "Shortage"
                    : shortage < 0
                      ? "Excess"
                      : "Balanced" }
                </span>
                <span className="text-3xl font-bold">
                  ₹{ Math.abs( shortage ).toFixed( 2 ) }
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
