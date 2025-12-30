"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateSales } from "@/app/actions/counter"
import type { DayEntry, SalesData } from "@/lib/types"
import type { User } from "@/lib/auth"
import { calculateCashSales, calculateTotalPayments } from "@/lib/types"
import { AlertCircle } from "lucide-react"

interface SalesPageProps {
  entry: DayEntry
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
  user: User
}

export default function SalesPage({ entry, refreshEntry, isReadOnly, user }: SalesPageProps) {
  const [sales, setSales] = useState<SalesData>(entry.sales)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const isFashionBoth = user.counterName === "Smart Fashion (Both)"

  const handleUpdateSales = async () => {
    await updateSales(sales)
    setHasUnsavedChanges(false)
    await refreshEntry()
  }

  const previewCashSales = calculateCashSales(sales, isFashionBoth)

  const savedCashSales = calculateCashSales(entry.sales, isFashionBoth)
  const totalPayments = calculateTotalPayments(entry.payments)

  const handleSalesChange = (updates: Partial<SalesData>) => {
    setSales({ ...sales, ...updates })
    setHasUnsavedChanges(true)
  }

  return (
    <div className="space-y-6">
      {hasUnsavedChanges && (
        <Card className="p-4 border-orange-500 bg-orange-50 dark:bg-orange-950">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">You have unsaved changes. Click "Save Sales" to update.</span>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Sales Entry (End of Day)</h2>

        {!isFashionBoth ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Total Sales</label>
              <Input
                type="number"
                value={sales.totalSales}
                onChange={(e) => handleSalesChange({ totalSales: Number.parseFloat(e.target.value) || 0 })}
                disabled={isReadOnly}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Card / UPI Sales</label>
              <Input
                type="number"
                value={sales.cardUpiSales}
                onChange={(e) => handleSalesChange({ cardUpiSales: Number.parseFloat(e.target.value) || 0 })}
                disabled={isReadOnly}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Credit Sales</label>
              <Input
                type="number"
                value={sales.creditSales}
                onChange={(e) => handleSalesChange({ creditSales: Number.parseFloat(e.target.value) || 0 })}
                disabled={isReadOnly}
                placeholder="0.00"
              />
            </div>
            <div className="bg-secondary p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="font-medium">Cash Sales (Preview):</span>
                <span className="text-lg font-bold">₹{previewCashSales.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total - Card/UPI - Credit</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 text-primary">Smart Mart</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-2">Total Sales</label>
                  <Input
                    type="number"
                    value={sales.martTotalSales || 0}
                    onChange={(e) => handleSalesChange({ martTotalSales: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Card / UPI</label>
                  <Input
                    type="number"
                    value={sales.martCardUpi || 0}
                    onChange={(e) => handleSalesChange({ martCardUpi: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Credit</label>
                  <Input
                    type="number"
                    value={sales.martCredit || 0}
                    onChange={(e) => handleSalesChange({ martCredit: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 text-accent">Smart Fashion</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-2">Total Sales</label>
                  <Input
                    type="number"
                    value={sales.fashionTotalSales || 0}
                    onChange={(e) => handleSalesChange({ fashionTotalSales: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Card / UPI</label>
                  <Input
                    type="number"
                    value={sales.fashionCardUpi || 0}
                    onChange={(e) => handleSalesChange({ fashionCardUpi: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Credit</label>
                  <Input
                    type="number"
                    value={sales.fashionCredit || 0}
                    onChange={(e) => handleSalesChange({ fashionCredit: Number.parseFloat(e.target.value) || 0 })}
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            </div>

            <div className="bg-secondary p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="font-medium">Total Cash Sales (Preview):</span>
                <span className="text-lg font-bold">₹{previewCashSales.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Mart + Fashion Cash</p>
            </div>
          </div>
        )}

        {!isReadOnly && (
          <Button onClick={handleUpdateSales} className="w-full mt-4" disabled={!hasUnsavedChanges}>
            {hasUnsavedChanges ? "Save Sales" : "Saved ✓"}
          </Button>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Expected Cash Summary (Saved)</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Opening Cash:</span>
            <span>₹{entry.openingCash.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>+ Cash Sales:</span>
            <span>₹{savedCashSales.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>- Payments:</span>
            <span>₹{totalPayments.toFixed(2)}</span>
          </div>
          <div className="border-t border-border pt-2">
            <div className="flex justify-between items-center font-bold">
              <span>Expected Cash:</span>
              <span className="text-xl text-primary">
                ₹{(entry.openingCash + savedCashSales - totalPayments).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        {hasUnsavedChanges && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            This shows your last saved values. Save sales to update expected cash.
          </p>
        )}
      </Card>
    </div>
  )
}
