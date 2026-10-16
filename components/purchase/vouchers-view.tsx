"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import StatusChip from "@/components/status-chip"
import { Notice } from "@/components/notice"
import { SettleVoucherForm } from "./forms"
import { relativeDay } from "./common"
import { cancelVoucher } from "@/app/actions/purchase"
import { inr, shortDate, todayIST } from "@/lib/report"
import type { VoucherStatus } from "@/lib/purchase"
import type { VoucherRow } from "@/lib/purchase-service"

type Filter = VoucherStatus | "all"
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "settled", label: "Settled" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
]
const TONE: Record<VoucherStatus, "warning" | "success" | "neutral"> = {
  pending: "warning",
  settled: "success",
  cancelled: "neutral",
}

export default function VouchersView({
  vouchers,
  role,
}: {
  vouchers: VoucherRow[]
  role: "purchase" | "admin" | "supervisor"
}) {
  const router = useRouter()
  const today = todayIST()
  const [filter, setFilter] = useState<Filter>("pending")
  const [settling, setSettling] = useState<VoucherRow | null>(null)
  const [error, setError] = useState("")

  const pending = vouchers.filter((v) => v.status === "pending")
  const overdue = pending.filter((v) => v.promisedDate && v.promisedDate < today)
  const vendorsWaiting = new Set(pending.map((v) => v.vendorId)).size

  const shown = vouchers
    .filter((v) => filter === "all" || v.status === filter)
    // pending: promised soonest first (no date last); history: newest first
    .sort((a, b) =>
      filter === "pending"
        ? (a.promisedDate ?? "9999").localeCompare(b.promisedDate ?? "9999")
        : b.issuedDate.localeCompare(a.issuedDate)
    )

  const cancel = async (v: VoucherRow) => {
    if (!confirm(`Cancel voucher ${v.number}? The bill goes back to unpaid.`)) return
    setError("")
    const res = await cancelVoucher(v._id)
    if (res.error) return setError(res.error)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Pending vouchers" value={`₹${inr(pending.reduce((s, v) => s + v.amount, 0))}`} sub={`${pending.length} voucher${pending.length === 1 ? "" : "s"}`} />
        <Kpi
          label="Past the promised date"
          value={`₹${inr(overdue.reduce((s, v) => s + v.amount, 0))}`}
          sub={`${overdue.length} voucher${overdue.length === 1 ? "" : "s"}`}
          tone={overdue.length ? "danger" : undefined}
        />
        <Kpi label="Vendors waiting" value={String(vendorsWaiting)} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {shown.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">No vouchers here.</Card>
      ) : (
        <Card className="p-2">
          <div className="divide-y">
            {shown.map((v) => {
              const late = v.status === "pending" && v.promisedDate && v.promisedDate < today
              return (
                <div key={v._id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/purchase/vendors/${v.vendorId}`} className="text-sm font-medium hover:underline">
                      {v.vendorName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      Voucher {v.number} · given {shortDate(v.issuedDate)}
                      {v.status === "pending" && v.promisedDate && (
                        <>
                          {" · "}
                          <span className={late ? "font-medium text-danger" : ""}>
                            to be paid by {shortDate(v.promisedDate)} ({relativeDay(v.promisedDate, today)})
                          </span>
                        </>
                      )}
                      {v.status === "settled" && v.settledAt && ` · settled ${shortDate(v.settledAt.slice(0, 10))}`}
                    </div>
                  </div>
                  {late && <StatusChip tone="danger" dot={false}>Overdue</StatusChip>}
                  <StatusChip tone={TONE[v.status]}>{v.status[0].toUpperCase() + v.status.slice(1)}</StatusChip>
                  <div className="w-28 text-right text-sm font-semibold">₹{inr(v.amount)}</div>
                  {role !== "supervisor" && v.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => setSettling(v)}>
                        Settle
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancel(v)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {settling && (
        <SettleVoucherForm
          voucher={settling}
          vendorName={settling.vendorName}
          asAdmin={role === "admin"}
          onClose={() => setSettling(null)}
          onDone={() => {
            setSettling(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <Card className={`px-4 py-3 ${tone === "danger" ? "border-danger/30 bg-danger-soft" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}
