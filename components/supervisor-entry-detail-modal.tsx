"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { DayEntry, DenominationCount } from "@/lib/types"
import {
  calculateCashSales,
  calculateClosingCash,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import { X } from "lucide-react"

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

const DENOMS: Array<[string, keyof DenominationCount, number]> = [
  ["₹500", "notes500", 500],
  ["₹200", "notes200", 200],
  ["₹100", "notes100", 100],
  ["₹50", "notes50", 50],
  ["₹20", "notes20", 20],
  ["₹10", "notes10", 10],
  ["₹10", "coins10", 10],
  ["₹5", "coins5", 5],
  ["₹2", "coins2", 2],
  ["₹1", "coins1", 1],
]

const subtractDenoms = (
  closing: DenominationCount,
  nextDay: DenominationCount
): DenominationCount => {
  const r = { ...EMPTY_DENOMS }
  ;(Object.keys(r) as (keyof DenominationCount)[]).forEach((k) => {
    r[k] = Math.max(0, closing[k] - (nextDay[k] || 0))
  })
  return r
}

/* ================= PROPS ================= */

interface Props {
  entry: DayEntry
  onClose: () => void
}

/* ================= COMPONENT ================= */

export default function SupervisorEntryDetailModal({
  entry,
  onClose,
}: Props) {
  const openingCash = entry.openingCash || 0

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const cashSales = calculateCashSales(entry.sales, isFashionBoth)
  const { totalIn, totalOut } = calculatePaymentSummary(entry.payments)

  const martTotalSales = entry.sales.martTotalSales ?? 0
  const martCardSales = entry.sales.martCardUpi ?? 0
  const martCreditSales = entry.sales.martCredit ?? 0
  const martCashSales = martTotalSales - martCardSales - martCreditSales

  const fashionTotalSales = entry.sales.fashionTotalSales ?? 0
  const fashionCardSales = entry.sales.fashionCardUpi ?? 0
  const fashionCreditSales = entry.sales.fashionCredit ?? 0
  const fashionCashSales =
    fashionTotalSales - fashionCardSales - fashionCreditSales

  const totalSales = isFashionBoth
    ? martTotalSales + fashionTotalSales
    : entry.sales.totalSales ?? 0

  const totalCashSales = isFashionBoth
    ? martCashSales + fashionCashSales
    : cashSales

  const totalCardSales = isFashionBoth
    ? martCardSales + fashionCardSales
    : entry.sales.cardUpiSales ?? 0

  const totalCreditSales = isFashionBoth
    ? martCreditSales + fashionCreditSales
    : entry.sales.creditSales ?? 0

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash(entry.closingDenominations)
  const shortage = expectedCash - actualCash

  const nextDayTotal = calculateClosingCash(
    entry.nextDayOpeningDenominations || EMPTY_DENOMS
  )

  const availableDenoms = subtractDenoms(
    entry.closingDenominations,
    entry.nextDayOpeningDenominations || EMPTY_DENOMS
  )

  const availableCash = calculateClosingCash(availableDenoms)

  /* ================= JSX ================= */

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background w-full max-w-5xl rounded-lg max-h-[90vh] overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-background border-b p-4 flex justify-between">
          <div>
            <h2 className="text-2xl font-bold">{entry.counterName}</h2>
            <p className="text-sm text-muted-foreground">{entry.date}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">

          {/* DAY SUMMARY */}
          <Card className="p-6 space-y-3">
            <h3 className="text-xl font-bold">Day Summary</h3>

            <Row label="Opening Cash" value={openingCash} />
            <Row label="Total Sales" value={totalSales} bold />

            {isFashionBoth && (
              <>
                <Divider />
                <Row label="TOTAL CASH SALES" value={totalCashSales} bold />
                <Row label="TOTAL CARD SALES" value={totalCardSales} bold />
                <Row label="TOTAL CREDIT SALES" value={totalCreditSales} bold />
              </>
            )}

            <Divider />

            <Row label="Payments IN" value={totalIn} />
            <Row label="Payments OUT" value={totalOut} />

            <Divider />

            <Row label="Expected Cash" value={expectedCash} bold />
            <Row label="Actual Cash" value={actualCash} bold />

            <div
              className={`flex justify-between font-bold ${
                shortage > 0
                  ? "text-red-600"
                  : shortage < 0
                  ? "text-green-600"
                  : ""
              }`}
            >
              <span>
                {shortage > 0
                  ? "SHORTAGE"
                  : shortage < 0
                  ? "EXCESS"
                  : "BALANCED"}
              </span>
              <span>₹{Math.abs(shortage).toFixed(2)}</span>
            </div>

            <Divider />

            <Row label="Next Day Opening" value={nextDayTotal} />
            <Row label="Available Cash" value={availableCash} bold />

            <div className="font-semibold pt-2">
              Available Cash Denominations
            </div>

            {DENOMS.map(([label, key, value]) =>
              availableDenoms[key] > 0 ? (
                <div key={key} className="flex justify-between text-sm">
                  <span>
                    {label} × {availableDenoms[key]}
                  </span>
                  <span>
                    ₹{(availableDenoms[key] * value).toFixed(2)}
                  </span>
                </div>
              ) : null
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ================= HELPERS ================= */

function Row({
  label,
  value,
  bold = false,
}: {
  label: string
  value: number
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>₹{value.toFixed(2)}</span>
    </div>
  )
}

function Divider() {
  return <div className="border-t my-2" />
}
