"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addPayment, deletePayment, updatePayment } from "@/app/actions/counter"
import type { DayEntry } from "@/lib/types"
import { calculateTotalPayments } from "@/lib/types"
import { Plus, Trash2, Pencil, Check, X } from "lucide-react"

interface PaymentsPageProps {
  entry: DayEntry
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
}

export default function PaymentsPage({ entry, refreshEntry, isReadOnly }: PaymentsPageProps) {
  const [paymentDesc, setPaymentDesc] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDesc, setEditDesc] = useState("")
  const [editAmount, setEditAmount] = useState("")

  const handleAddPayment = async () => {
    const amount = Number.parseFloat(paymentAmount)
    if (!paymentDesc || isNaN(amount) || amount <= 0) return

    await addPayment(paymentDesc, amount)
    await refreshEntry()
    setPaymentDesc("")
    setPaymentAmount("")
  }

  const handleDeletePayment = async (index: number) => {
    if (confirm("Delete this payment?")) {
      await deletePayment(index)
      await refreshEntry()
    }
  }

  const startEdit = (index: number) => {
    setEditingIndex(index)
    setEditDesc(entry.payments[index].description)
    setEditAmount(entry.payments[index].amount.toString())
  }

  const saveEdit = async () => {
    if (editingIndex === null) return
    const amount = Number.parseFloat(editAmount)
    if (!editDesc || isNaN(amount) || amount <= 0) return

    await updatePayment(editingIndex, editDesc, amount)
    await refreshEntry()
    setEditingIndex(null)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
  }

  const totalPayments = calculateTotalPayments(entry.payments)

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Payments (Money Going Out)</h2>
          <div className="text-sm text-muted-foreground">Opening: ₹{entry.openingCash.toFixed(2)}</div>
        </div>

        {!isReadOnly && (
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Description (e.g., Tea, Auto)"
              value={paymentDesc}
              onChange={(e) => setPaymentDesc(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Amount"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-32"
            />
            <Button onClick={handleAddPayment}>
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {entry.payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No payments yet</p>
          ) : (
            entry.payments.map((payment, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                {editingIndex === index ? (
                  <>
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="flex-1" />
                    <Input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-32"
                    />
                    <Button size="sm" onClick={saveEdit} variant="default">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={cancelEdit} variant="outline">
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium">{payment.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(payment.time).toLocaleTimeString("en-IN")}
                      </div>
                    </div>
                    <div className="text-lg font-bold">₹{payment.amount.toFixed(2)}</div>
                    {!isReadOnly && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startEdit(index)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeletePayment(index)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="bg-primary/10 p-4 rounded-lg mt-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Payments:</span>
            <span className="text-2xl font-bold text-primary">₹{totalPayments.toFixed(2)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
