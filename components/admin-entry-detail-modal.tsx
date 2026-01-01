"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateCashSales,
  calculateClosingCash,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import { X } from "lucide-react"
import { getOpeningCashForDate } from "@/app/actions/counter"
import { updateEntryOpeningCash } from "@/app/actions/admin"

/* ================= CONSTANTS ================= */

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

const DENOMS: Array<[ string, keyof DenominationCount, number ]> = [
  [ "₹500", "notes500", 500 ],
  [ "₹200", "notes200", 200 ],
  [ "₹100", "notes100", 100 ],
  [ "₹50", "notes50", 50 ],
  [ "₹20", "notes20", 20 ],
  [ "₹10", "notes10", 10 ],
  [ "₹10", "coins10", 10 ],
  [ "₹5", "coins5", 5 ],
  [ "₹2", "coins2", 2 ],
  [ "₹1", "coins1", 1 ],
]

const subtractDenoms = (
  closing: DenominationCount,
  nextDay: DenominationCount
): DenominationCount =>
{
  const r = { ...EMPTY_DENOMS }
    ; ( Object.keys( r ) as ( keyof DenominationCount )[] ).forEach( k =>
    {
      r[ k ] = Math.max( 0, closing[ k ] - ( nextDay[ k ] || 0 ) )
    } )
  return r
}

/* ================= PROPS ================= */

interface Props
{
  entry: DayEntry
  onClose: () => void
  onUpdate: () => void
}

/* ================= COMPONENT ================= */

export default function AdminEntryDetailModal ( {
  entry,
  onClose,
  onUpdate,
}: Props )
{

  const [ openingCash, setOpeningCash ] = useState( 0 )
  const [ loadingOpening, setLoadingOpening ] = useState( true )

  /* ===== FETCH OPENING CASH (SINGLE SOURCE OF TRUTH) ===== */

  useEffect(() =>
{
  setOpeningCash(entry.openingCash || 0)
  setLoadingOpening(false)
}, [entry._id])


  /* ================= CALCULATIONS ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const cashSales = calculateCashSales( entry.sales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash( entry.closingDenominations )
  const shortage = expectedCash - actualCash

  const nextDayTotal = calculateClosingCash(
    entry.nextDayOpeningDenominations || EMPTY_DENOMS
  )

  const availableDenoms = subtractDenoms(
    entry.closingDenominations,
    entry.nextDayOpeningDenominations || EMPTY_DENOMS
  )

  const availableCash = calculateClosingCash( availableDenoms )

  const totalSales =
    cashSales + entry.payments.reduce( ( s, p ) => s + p.amount, 0 )

  /* ================= ACTION ================= */

  const handleOverrideOpening = async () =>
  {
    await updateEntryOpeningCash(
      entry._id!,
      openingCash,
      entry.openingDenominations || EMPTY_DENOMS
    )
    onUpdate()
  }

  /* ================= JSX ================= */

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background w-full max-w-5xl rounded-lg max-h-[90vh] overflow-y-auto">

        {/* HEADER */ }
        <div className="sticky top-0 bg-background border-b p-4 flex justify-between">
          <div>
            <h2 className="text-2xl font-bold">{ entry.counterName }</h2>
            <p className="text-sm text-muted-foreground">{ entry.date }</p>
          </div>
          <Button variant="ghost" size="sm" onClick={ onClose }>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">

          {/* SUMMARY CARD */ }
          <Card className="p-6 space-y-2">
            <h3 className="text-xl font-bold mb-2">Day Summary</h3>

            <div className="flex justify-between">
              <span>Opening Cash</span>
              <span>₹{ loadingOpening ? "…" : openingCash.toFixed( 2 ) }</span>
            </div>

            <div className="flex justify-between">
              <span>Total Sales</span>
              <span>₹{ totalSales.toFixed( 2 ) }</span>
            </div>

            <div className="flex justify-between">
              <span>Cash Sales</span>
              <span>₹{ cashSales.toFixed( 2 ) }</span>
            </div>

            <div className="flex justify-between text-green-600">
              <span>Payments In</span>
              <span>₹{ totalIn.toFixed( 2 ) }</span>
            </div>

            <div className="flex justify-between text-red-600">
              <span>Payments Out</span>
              <span>₹{ totalOut.toFixed( 2 ) }</span>
            </div>

            <div className="flex justify-between">
              <span>Next Day Opening</span>
              <span>₹{ nextDayTotal.toFixed( 2 ) }</span>
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
              className={ `border-t pt-2 flex justify-between font-extrabold ${ shortage > 0
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

            <div className="border-t pt-2">
              <div className="font-semibold mb-1">Available Cash</div>
              { DENOMS.map( ( [ l, k, v ] ) =>
                availableDenoms[ k ] > 0 ? (
                  <div key={ k } className="flex justify-between text-sm">
                    <span>{ l } × { availableDenoms[ k ] }</span>
                    <span>₹{ ( availableDenoms[ k ] * v ).toFixed( 2 ) }</span>
                  </div>
                ) : null
              ) }
              <div className="flex justify-between font-bold border-t mt-1 pt-1">
                <span>Total</span>
                <span>₹{ availableCash.toFixed( 2 ) }</span>
              </div>
            </div>

            <div className="flex justify-between border-t pt-2 font-bold">
              <span>Closed By</span>
              <span>{ entry.closedBy || "-" }</span>
            </div>
          </Card>

          {/* OPENING CASH OVERRIDE */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-2">Override Opening Cash</h3>
            <div className="flex gap-3">
              <input
                type="number"
                className="border rounded px-3 py-1 w-full"
                value={ openingCash }
                onChange={ e =>
                  setOpeningCash( Number( e.target.value ) || 0 )
                }
              />
              <Button onClick={ handleOverrideOpening }>Update</Button>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}
