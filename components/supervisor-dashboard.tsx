"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getAllEntries } from "@/app/actions/admin"
import type { DayEntry, DenominationCount } from "@/lib/types"
import {
  calculateCashSales,
  calculatePaymentSummary,
  calculateClosingCash,
} from "@/lib/types"
import { LogOut, Calendar } from "lucide-react"
import SupervisorEntryDetailModal from "./supervisor-entry-detail-modal"

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
) => {
  const r = { ...EMPTY_DENOMS }
  ;(Object.keys(r) as (keyof DenominationCount)[]).forEach((k) => {
    r[k] = Math.max(0, closing[k] - (nextDay?.[k] || 0))
  })
  return r
}

const formatTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-"

/* ================= COMPONENT ================= */

interface SupervisorDashboardProps {
  initialEntries: DayEntry[]
}

export default function SupervisorDashboard({
  initialEntries,
}: SupervisorDashboardProps) {
  const [entries, setEntries] = useState<DayEntry[]>(initialEntries)
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [selectedEntry, setSelectedEntry] = useState<DayEntry | null>(null)

  /* ================= DEDUPE ================= */

  const uniqueEntries = useMemo(() => {
    const map = new Map<string, DayEntry>()

    for (const entry of entries) {
      const key = `${entry.counterName}_${entry.date}`
      if (!map.has(key)) map.set(key, entry)
    }

    return Array.from(map.values())
  }, [entries])

  /* ================= DATE ================= */

  const handleDateChange = async (date: string) => {
    setSelectedDate(date)
    setEntries(await getAllEntries(date))
  }

  /* ================= RENDER ================= */

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between">
          <div>
            <h1 className="text-2xl font-bold">Supervisor Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Smart Mart & Smart Fashions
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <Calendar className="w-5 h-5" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />

            <Button variant="outline" size="sm" onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Counter Status</h2>

          {uniqueEntries.map((entry) => {
            const isBoth = entry.counterName === "Smart Fashion (Both)"
            const cashSales = calculateCashSales(entry.sales, isBoth)
            const { totalOut } = calculatePaymentSummary(entry.payments)

            const availableCash = calculateClosingCash(
              subtractDenoms(
                entry.closingDenominations,
                entry.nextDayOpeningDenominations
              )
            )

            const card = isBoth
              ? (entry.sales.martCardUpi || 0) +
                (entry.sales.fashionCardUpi || 0)
              : entry.sales.cardUpiSales || 0

            const credit = isBoth
              ? (entry.sales.martCredit || 0) +
                (entry.sales.fashionCredit || 0)
              : entry.sales.creditSales || 0

            const totalSales = cashSales + card + credit
            const shortage = entry.submittedShortage || 0

            return (
              <div key={entry._id} className="border rounded-lg p-4 mb-3">
                <h3 className="font-semibold">{entry.counterName}</h3>

                {/* STATUS */}
                <div className="text-xs mt-1">
                  {entry.status === "open" && (
                    <span className="text-blue-600 font-medium">● Open</span>
                  )}
                  {entry.status === "submitted" && (
                    <span className="text-orange-600 font-medium">
                      ● Submitted
                    </span>
                  )}
                  {entry.status === "confirmed" && (
                    <span className="text-green-600 font-medium">
                      ● Confirmed
                    </span>
                  )}
                </div>

                {/* OPENING VERIFIED */}
                <div className="text-xs mt-1">
                  Opening cash:
                  {entry.openingVerified ? (
                    <span className="text-green-600 font-medium">
                      {" "}VERIFIED at {formatTime(entry.openingVerifiedAt)}
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium">
                      {" "}NOT VERIFIED
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-3 text-sm">
                  <div>Total Sales: ₹{totalSales.toFixed(2)}</div>
                  <div>Cash Sales: ₹{cashSales.toFixed(2)}</div>
                  <div>Payments OUT: ₹{totalOut.toFixed(2)}</div>
                  <div>Available Cash: ₹{availableCash.toFixed(2)}</div>

                  <div
                    className={
                      shortage > 0
                        ? "text-red-600 font-semibold"
                        : shortage < 0
                        ? "text-green-600 font-semibold"
                        : "font-semibold"
                    }
                  >
                    {shortage > 0
                      ? "Shortage"
                      : shortage < 0
                      ? "Excess"
                      : "Balanced"}{" "}
                    ₹{Math.abs(shortage).toFixed(2)}
                  </div>
                </div>

                <div className="flex gap-3 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>
      </main>

      {/* VIEW DETAILS MODAL (READ-ONLY) */}
      {selectedEntry && (
        <SupervisorEntryDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}
