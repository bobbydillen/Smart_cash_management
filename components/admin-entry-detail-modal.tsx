"use client"

import { useState } from "react"
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
  const [ openingCash, setOpeningCash ] = useState( entry.openingCash || 0 )

  /* ================= CALCULATIONS ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"

  const cashSales = calculateCashSales( entry.sales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const cardUpiSales = isFashionBoth
    ? ( entry.sales.martCardUpi || 0 ) +
    ( entry.sales.fashionCardUpi || 0 )
    : ( entry.sales.cardUpiSales || 0 )

  const creditSales = isFashionBoth
    ? ( entry.sales.martCredit || 0 ) +
    ( entry.sales.fashionCredit || 0 )
    : ( entry.sales.creditSales || 0 )

  const totalSales = cashSales + cardUpiSales + creditSales

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

  /* ================= ACTION ================= */

  const handleOverrideOpening = async () =>
  {
    await updateEntryOpeningCash( entry._id!, openingCash )
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

          {/* DAY SUMMARY */ }
          <Card className="p-6 space-y-2">
            <h3 className="text-xl font-bold mb-2">Day Summary</h3>

            <Row label="Opening Cash" value={ openingCash } />
            <Row label="Total Sales" value={ totalSales } bold />
            <Row label="Cash Sales" value={ cashSales } />
            <Row label="Card / UPI Sales" value={ cardUpiSales } color="text-blue-600" />
            <Row label="Credit Sales" value={ creditSales } color="text-purple-600" />
            <Row label="Payments In" value={ totalIn } color="text-green-600" />
            <Row label="Payments Out" value={ totalOut } color="text-red-600" />

            <Divider />

            <Row label="Expected Cash" value={ expectedCash } bold />
            <Row label="Actual Cash" value={ actualCash } bold />

            <div
              className={ `flex justify-between font-extrabold ${ shortage > 0
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

            <Divider />

            <Row label="Next Day Opening" value={ nextDayTotal } />

            <Divider />

            <Row label="Total Available Cash" value={ availableCash } bold />

            <div className="font-semibold pt-2">Available Cash Denominations</div>

            { DENOMS.map( ( [ label, key, value ] ) =>
              availableDenoms[ key ] > 0 ? (
                <div key={ key } className="flex justify-between text-sm">
                  <span>{ label } × { availableDenoms[ key ] }</span>
                  <span>₹{ ( availableDenoms[ key ] * value ).toFixed( 2 ) }</span>
                </div>
              ) : null
            ) }




          </Card>

          {/* PAYMENTS */ }
          <Card className="p-4">
            <h3 className="font-bold mb-3">Payments (IN / OUT)</h3>

            <div className="mb-4 p-3 rounded border bg-muted/40">
              <div className="text-xs text-muted-foreground">
                Payment Entry Number
              </div>
              <div className="font-semibold text-sm">
                { entry.paymentRefNumber || "-" }
              </div>
            </div>

            { entry.payments.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No payment entries recorded.
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                { entry.payments.map( ( p, i ) => (
                  <div
                    key={ i }
                    className={ `flex justify-between p-2 rounded ${ ( p.type ?? "OUT" ) === "IN"
                      ? "bg-green-50"
                      : "bg-red-50"
                      }` }
                  >
                    <div>
                      <div className="font-medium">
                        { ( p.type ?? "OUT" ) === "IN" ? "➕ IN" : "➖ OUT" } — { p.description }
                      </div>
                      <div className="text-xs text-muted-foreground">
                        { new Date( p.time ).toLocaleTimeString( "en-IN" ) }
                      </div>
                    </div>
                    <div className="font-bold">₹{ p.amount.toFixed( 2 ) }</div>
                  </div>
                ) ) }
              </div>
            ) }
          </Card>

          {/* OPENING CASH OVERRIDE */ }
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-2">Override Opening Cash</h3>
            <div className="flex gap-3">
              <input
                type="number"
                className="border rounded px-3 py-1 w-full"
                value={ openingCash }
                onChange={ e => setOpeningCash( Number( e.target.value ) || 0 ) }
              />
              <Button onClick={ handleOverrideOpening }>Update</Button>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}

/* ================= HELPERS ================= */

function Row ( {
  label,
  value,
  bold = false,
  color = "",
}: {
  label: string
  value: number
  bold?: boolean
  color?: string
} )
{
  return (
    <div className={ `flex justify-between ${ bold ? "font-bold" : "" } ${ color }` }>
      <span>{ label }</span>
      <span>₹{ value.toFixed( 2 ) }</span>
    </div>
  )
}

function Divider ()
{
  return <div className="border-t my-2" />
}
