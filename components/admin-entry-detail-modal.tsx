"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
  {
    calculateCashSales,
    calculateClosingCash,
    calculatePaymentSummary,
    calculateExpectedCashWithInOut,
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

  /* ================= STATE ================= */

  // ✅ OPENING
  const [ openingCash, setOpeningCash ] = useState( entry.openingCash )
  const [ openingDenominations, setOpeningDenominations ] =
    useState<DenominationCount>( entry.openingDenominations )

  // ✅ CLOSING
  const [ closingDenominations, setClosingDenominations ] =
    useState<DenominationCount>( entry.closingDenominations )

  /* ================= SYNC ENTRY ================= */

  useEffect( () =>
  {
    setOpeningCash( entry.openingCash )
    setOpeningDenominations( entry.openingDenominations )
    setClosingDenominations( entry.closingDenominations )
  }, [ entry ] )

  /* ================= CASH SALES ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const cashSales = calculateCashSales( entry.sales, isFashionBoth )

  /* ================= PAYMENTS ================= */

  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  /* ================= CALCULATIONS ================= */

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash( closingDenominations )
  const shortage = expectedCash - actualCash

  /* ================= ACTIONS ================= */

  const handleUpdateOpening = async () =>
  {
    await updateEntryOpeningCash(
      entry._id!,
      openingCash,
      openingDenominations
    )
    onUpdate()
  }

  const handleUpdateClosing = async () =>
  {
    await updateEntryClosingCash( entry._id!, closingDenominations )
    onUpdate()
  }

  /* ================= JSX ================= */

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">

        {/* ===== HEADER ===== */ }
        <div className="sticky top-0 bg-background border-b p-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">{ entry.counterName }</h2>
            <p className="text-sm text-muted-foreground">
              { new Date( entry.date ).toLocaleDateString( "en-IN" ) }
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={ onClose }>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">

          {/* ===== OPENING CASH ===== */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">
              Opening Cash (Admin Override)
            </h3>

            <Input
              type="number"
              value={ openingCash }
              onChange={ e => setOpeningCash( Number( e.target.value ) || 0 ) }
            />

            <div className="grid grid-cols-4 gap-3 mt-4">
              { Object.entries( openingDenominations ).map( ( [ k, v ] ) => (
                <div key={ k }>
                  <label className="text-xs">{ k }</label>
                  <Input
                    type="number"
                    value={ v }
                    onChange={ e =>
                      setOpeningDenominations( {
                        ...openingDenominations,
                        [ k ]: Number( e.target.value ) || 0,
                      } )
                    }
                  />
                </div>
              ) ) }
            </div>

            <Button className="mt-4" onClick={ handleUpdateOpening }>
              Update Opening
            </Button>
          </Card>

          {/* ===== CLOSING DENOMINATIONS ===== */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">
              Closing Denominations
            </h3>

            <div className="grid grid-cols-4 gap-3">
              { Object.entries( closingDenominations ).map( ( [ k, v ] ) => (
                <div key={ k }>
                  <label className="text-xs">{ k }</label>
                  <Input
                    type="number"
                    value={ v }
                    onChange={ e =>
                      setClosingDenominations( {
                        ...closingDenominations,
                        [ k ]: Number( e.target.value ) || 0,
                      } )
                    }
                  />
                </div>
              ) ) }
            </div>

            <Button className="mt-4" onClick={ handleUpdateClosing }>
              Update Closing
            </Button>
          </Card>

          {/* ===== CASH RECONCILIATION ===== */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Cash Reconciliation</h3>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Opening Cash</span>
                <span>₹{ openingCash.toFixed( 2 ) }</span>
              </div>

              <div className="flex justify-between text-green-600">
                <span>+ Cash Sales</span>
                <span>₹{ cashSales.toFixed( 2 ) }</span>
              </div>

              <div className="flex justify-between text-green-600">
                <span>+ Payments In</span>
                <span>₹{ totalIn.toFixed( 2 ) }</span>
              </div>

              <div className="flex justify-between text-red-600">
                <span>- Payments Out</span>
                <span>₹{ totalOut.toFixed( 2 ) }</span>
              </div>

              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Expected Cash</span>
                <span>₹{ expectedCash.toFixed( 2 ) }</span>
              </div>

              <div className="flex justify-between font-bold">
                <span>Actual Cash</span>
                <span>₹{ actualCash.toFixed( 2 ) }</span>
              </div>

              <div
                className={ `border-t pt-2 flex justify-between text-2xl font-extrabold ${ shortage > 0
                    ? "text-red-600"
                    : shortage < 0
                      ? "text-green-600"
                      : ""
                  }` }
              >
                <span>
                  { shortage > 0
                    ? "SHORTAGE"
                    : shortage < 0
                      ? "EXCESS"
                      : "BALANCED" }
                </span>
                <span>₹{ Math.abs( shortage ).toFixed( 2 ) }</span>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}
