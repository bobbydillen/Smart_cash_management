"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StatusChip from "@/components/status-chip"
import { ChevronRight, Plus, Search } from "lucide-react"
import { VendorForm } from "./forms"
import { inr } from "@/lib/report"
import type { VendorRow } from "@/lib/purchase-service"

export default function VendorsView({
  vendors,
  role,
}: {
  vendors: VendorRow[]
  role: "purchase" | "admin" | "supervisor"
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding] = useState(false)

  const active = vendors.filter((v) => v.active)
  const totalToPay = active.reduce((s, v) => s + Math.max(v.balance.totalToPay, 0), 0)
  const vouchers = active.reduce((s, v) => s + v.balance.vouchersPending, 0)
  const owed = active.filter((v) => v.balance.totalToPay > 0.004).length

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return vendors
      .filter((v) => showInactive || v.active)
      .filter((v) => !q || [v.name, v.items, v.phone].some((f) => (f ?? "").toLowerCase().includes(q)))
      // who we owe the most comes first
      .sort((a, b) => b.balance.totalToPay - a.balance.totalToPay || a.name.localeCompare(b.name))
  }, [vendors, search, showInactive])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Summary label="Total to pay" value={`₹${inr(totalToPay)}`} />
        <Summary label="Vouchers pending" value={`₹${inr(vouchers)}`} />
        <Summary label="Vendors owed" value={`${owed} of ${active.length}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, item or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {role === "purchase" && (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add vendor
          </Button>
        )}
      </div>

      {vendors.some((v) => !v.active) && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive vendors
        </label>
      )}

      {shown.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">
          {vendors.length === 0 ? "No vendors yet. Add the first one to get started." : "No vendors match your search."}
        </Card>
      ) : (
        <Card className="p-2">
          <div className="divide-y">
            {shown.map((v) => (
              <Link
                key={v._id}
                href={`/purchase/vendors/${v._id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-secondary/60"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {v.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    {!v.active && <StatusChip tone="neutral" dot={false}>Inactive</StatusChip>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{v.items || v.phone || "—"}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${v.balance.totalToPay > 0.004 ? "" : "text-muted-foreground"}`}>
                    {v.balance.totalToPay > 0.004 ? `₹${inr(v.balance.totalToPay)}` : "Nothing due"}
                  </div>
                  {v.balance.vouchersPending > 0.004 && (
                    <div className="text-xs text-warning">incl. ₹{inr(v.balance.vouchersPending)} vouchers</div>
                  )}
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {adding && (
        <VendorForm
          onClose={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false)
            if (id) router.push(`/purchase/vendors/${id}`)
            else router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
    </Card>
  )
}
