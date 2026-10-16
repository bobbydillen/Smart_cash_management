"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import SectionHeader from "@/components/section-header"
import { Truck } from "lucide-react"
import { loadCounterVendors, payVendor } from "@/app/actions/counter"
import { inr, todayIST } from "@/lib/report"
import type { Payment } from "@/lib/types"
import type { CounterVendor } from "@/lib/purchase-service"

const selectClass = "h-10 w-full rounded-lg border bg-card px-3 text-sm"

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>
)

const Money = ({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
    <Input
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      className="pl-7"
    />
  </div>
)

/**
 * A vendor hands over a NEW bill and the counter pays some or all of it in cash.
 * The bill is recorded, the payment is recorded against it, and the amount shows as
 * "Money out" on this page, all in one step.
 */
export default function VendorPaymentSection({
  isReadOnly,
  onPaid,
}: {
  isReadOnly: boolean
  /** the counter's updated payments list */
  onPaid: (payments: Payment[]) => void
}) {
  const today = todayIST()
  const [vendors, setVendors] = useState<CounterVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [vendorId, setVendorId] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [billDate, setBillDate] = useState(today)
  const [billAmount, setBillAmount] = useState("")
  const [amount, setAmount] = useState("")
  const [touchedAmount, setTouchedAmount] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadCounterVendors().then((list) => {
      setVendors(list)
      setLoading(false)
    })
  }, [])

  const vendor = vendors.find((v) => v._id === vendorId)
  const billTotal = Number(billAmount) || 0
  const paying = Number(amount) || 0
  const over = paying > billTotal + 0.004
  const left = Math.max(billTotal - paying, 0)

  // paying the whole bill is the usual case, so the amount follows the bill until it is edited
  const changeBillAmount = (v: string) => {
    setBillAmount(v)
    if (!touchedAmount) setAmount(v)
  }

  const ready = !!vendorId && !!billNumber.trim() && billTotal > 0 && paying > 0 && !over

  const pay = async () => {
    if (!confirm(`Pay ₹${inr(paying)} to ${vendor?.name} for new bill ${billNumber.trim()} (bill amount ₹${inr(billTotal)})? It will be recorded as Money out.`)) return
    setError("")
    setBusy(true)
    const res = await payVendor({ vendorId, billNumber, billDate, billAmount: billTotal, amount: paying, note })
    setBusy(false)
    if (res.error) return setError(res.error)
    if ("payments" in res) onPaid(res.payments as unknown as Payment[])
    setVendorId("")
    setBillNumber("")
    setBillDate(today)
    setBillAmount("")
    setAmount("")
    setTouchedAmount(false)
    setNote("")
  }

  if (!loading && vendors.length === 0 && isReadOnly) return null

  return (
    <Card className="p-5">
      <SectionHeader
        icon={<Truck className="size-4" />}
        title="Pay a vendor's bill"
        subtitle="A vendor hands over a new bill and you pay some or all of it in cash. It is recorded as Money out."
      />

      {loading ? (
        <div className="mt-4 text-sm text-muted-foreground">Loading vendors…</div>
      ) : vendors.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
          No vendors are set up yet. Ask the purchase counter to add them.
        </div>
      ) : (
        !isReadOnly && (
          <div className="mt-4 space-y-3 rounded-xl bg-secondary/60 p-3">
            <div>
              <Label>Vendor</Label>
              <select className={selectClass} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Choose vendor…</option>
                {vendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {vendor?.items && <p className="mt-1 text-xs text-muted-foreground">Supplies: {vendor.items}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bill number</Label>
                <Input value={billNumber} maxLength={40} placeholder="e.g. SLT-2301" onChange={(e) => setBillNumber(e.target.value)} />
              </div>
              <div>
                <Label>Bill date</Label>
                <Input type="date" value={billDate} max={today} onChange={(e) => setBillDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bill amount</Label>
                <Money value={billAmount} onChange={changeBillAmount} placeholder="Total of the bill" />
              </div>
              <div>
                <Label>Paying now</Label>
                <Money
                  value={amount}
                  onChange={(v) => {
                    setAmount(v)
                    setTouchedAmount(true)
                  }}
                  placeholder="Amount paid"
                />
              </div>
            </div>
            {over && <p className="text-xs text-danger">You cannot pay more than the bill amount (₹{inr(billTotal)}).</p>}

            {billTotal > 0 && paying > 0 && !over && (
              <div className="rounded-lg bg-card px-3 py-2 text-sm">
                {left < 0.005 ? (
                  <span className="font-medium text-success">Bill paid in full</span>
                ) : (
                  <>
                    Still to pay on this bill: <strong>₹{inr(left)}</strong>
                    <span className="text-muted-foreground"> (the purchase counter will see this)</span>
                  </>
                )}
              </div>
            )}

            <Input placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />

            <Button className="w-full" onClick={pay} disabled={busy || !ready}>
              {busy ? "Paying…" : paying > 0 ? `Pay ₹${inr(paying)}` : "Pay vendor"}
            </Button>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          </div>
        )
      )}
    </Card>
  )
}
