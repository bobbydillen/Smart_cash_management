"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { logout } from "@/app/actions/auth"
import { getEntryByDate } from "@/app/actions/counter"
import type { User } from "@/lib/auth"
import type { DayEntry } from "@/lib/types"
import { LogOut, CheckCircle, Calendar } from "lucide-react"
import PaymentsPage from "./pages/payments-page"
import SalesPage from "./pages/sales-page"
import ClosingPage from "./pages/closing-page"

interface CounterDashboardProps {
  user: User
  initialEntry: DayEntry | null
}

export default function CounterDashboard({ user, initialEntry }: CounterDashboardProps) {
  const [entry, setEntry] = useState<DayEntry | null>(initialEntry)
  const [currentPage, setCurrentPage] = useState<"payments" | "sales" | "closing">("payments")
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])

  const refreshEntry = async () => {
    const updated = await getEntryByDate(selectedDate)
    setEntry(updated)
  }

  const handleDateChange = async (date: string) => {
    setSelectedDate(date)
    const updated = await getEntryByDate(date)
    setEntry(updated)
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      const updated = await getEntryByDate(selectedDate)
      setEntry(updated)
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [selectedDate])

  if (!entry) return <div>Loading...</div>

  const isReadOnly = entry.status !== "open"

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{user.counterName}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(selectedDate).toLocaleDateString("en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <Input type="date" value={selectedDate} onChange={(e) => handleDateChange(e.target.value)} />
            </div>
            {entry.status === "submitted" && (
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Awaiting Admin Confirmation</span>
              </div>
            )}
            {entry.status === "confirmed" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Confirmed</span>
              </div>
            )}
            <Button onClick={() => logout()} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-2">
          <Button
            variant={currentPage === "payments" ? "default" : "outline"}
            onClick={() => setCurrentPage("payments")}
            className="flex-1"
            size="sm"
          >
            1. Payments
          </Button>
          <Button
            variant={currentPage === "sales" ? "default" : "outline"}
            onClick={() => setCurrentPage("sales")}
            className="flex-1"
            size="sm"
          >
            2. Sales
          </Button>
          <Button
            variant={currentPage === "closing" ? "default" : "outline"}
            onClick={() => setCurrentPage("closing")}
            className="flex-1"
            size="sm"
          >
            3. Closing
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {currentPage === "payments" && (
          <PaymentsPage entry={entry} refreshEntry={refreshEntry} isReadOnly={isReadOnly} />
        )}
        {currentPage === "sales" && (
          <SalesPage entry={entry} refreshEntry={refreshEntry} isReadOnly={isReadOnly} user={user} />
        )}
        {currentPage === "closing" && (
          <ClosingPage entry={entry} refreshEntry={refreshEntry} isReadOnly={isReadOnly} user={user} />
        )}
      </main>
    </div>
  )
}
