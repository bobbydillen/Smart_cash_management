"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import SectionHeader from "@/components/section-header"
import StatusChip from "@/components/status-chip"
import { ChevronLeft, ChevronRight, Printer, Truck } from "lucide-react"
import { loadDayReport } from "@/app/actions/purchase"
import { addMonths, inr, inrCompact, monthBounds, todayIST } from "@/lib/report"
import type { DayReportRow, VendorRow } from "@/lib/purchase-service"

// the chart splits what was paid by WHO paid it
const SERIES = [
  { key: "byPurchase", label: "Purchase counter", color: "var(--series-1)" },
  { key: "paidAdmin", label: "Admin", color: "var(--series-2)" },
  { key: "paidCounters", label: "Counters", color: "var(--series-3)" },
] as const

export default function ReportsView({ vendors }: { vendors: VendorRow[] }) {
  const today = todayIST()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [rows, setRows] = useState<DayReportRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    setLoading(true)
    const { start, end } = monthBounds(month)
    loadDayReport(start, end).then((r) => {
      if (stale) return
      setRows(r)
      setLoading(false)
    })
    return () => {
      stale = true
    }
  }, [month])

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          received: t.received + r.received,
          cash: t.cash + r.paidCash,
          cheque: t.cheque + r.paidCheque,
          voucher: t.voucher + r.paidVoucher,
          total: t.total + r.paidTotal,
          admin: t.admin + r.paidAdmin,
          counters: t.counters + r.paidCounters,
        }),
        { received: 0, cash: 0, cheque: 0, voucher: 0, total: 0, admin: 0, counters: 0 }
      ),
    [rows]
  )

  const monthLabel = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
  const chart = rows.map((r) => ({ label: String(Number(r.date.slice(8))), ...r, byPurchase: r.paidCash + r.paidCheque + r.paidVoucher }))
  const owed = vendors.filter((v) => v.balance.totalToPay > 0.004).sort((a, b) => b.balance.totalToPay - a.balance.totalToPay)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <div className="min-w-40 text-center text-sm font-semibold">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={month >= today.slice(0, 7)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 w-40 text-sm" />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Purchase report: {monthLabel}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Cash received" value={totals.received} />
        <Kpi label="Paid in total" value={totals.total} strong />
        <Kpi label="By purchase counter" value={totals.cash + totals.cheque + totals.voucher} />
        <Kpi label="By admin" value={totals.admin} />
        <Kpi label="By counters" value={totals.counters} />
        <Kpi label="Cash from drawer" value={totals.cash} />
        <Kpi label="By cheque" value={totals.cheque} />
        <Kpi label="By voucher" value={totals.voucher} />
      </div>

      {loading ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">No purchase activity in {monthLabel}.</Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Paid to vendors by day, by who paid</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {SERIES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `₹${inrCompact(v)}`} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={({ active, payload, label }: any) =>
                      active && payload?.length ? (
                        <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
                          <div className="mb-1 font-semibold">Day {label}</div>
                          {payload.map((p: any) => (
                            <div key={p.dataKey} className="flex justify-between gap-4">
                              <span className="text-muted-foreground">{p.name}</span>
                              <span className="font-medium tabular-nums">₹{inr(p.value)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  {SERIES.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="paid"
                      fill={s.color}
                      stroke="var(--card)"
                      strokeWidth={2}
                      maxBarSize={32}
                      radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 font-semibold">Day by day</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-2 text-left font-semibold">Date</th>
                    <th className="px-2 py-2 text-right font-semibold">Cash received</th>
                    <th className="px-2 py-2 text-right font-semibold">Cash</th>
                    <th className="px-2 py-2 text-right font-semibold">Cheque</th>
                    <th className="px-2 py-2 text-right font-semibold">Voucher</th>
                    <th className="px-2 py-2 text-right font-semibold">Admin</th>
                    <th className="px-2 py-2 text-right font-semibold">Counters</th>
                    <th className="px-2 py-2 text-right font-semibold">Total paid</th>
                    <th className="px-2 py-2 text-right font-semibold">Vendors</th>
                    <th className="px-2 py-2 text-right font-semibold">Day</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className="border-b">
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                        <Link href={`/purchase?date=${r.date}`} className="hover:underline">
                          {new Date(r.date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.received)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.paidCash)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.paidCheque)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.paidVoucher)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.paidAdmin)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.paidCounters)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{inr(r.paidTotal)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.vendorsPaid}</td>
                      <td className="px-2 py-1.5 text-right">
                        {r.status === "open" ? (
                          <span className="text-muted-foreground">Open</span>
                        ) : r.shortage !== null && Math.abs(r.shortage) >= 0.005 ? (
                          <span className={r.shortage > 0 ? "font-semibold text-danger" : "font-semibold text-info"}>
                            {r.shortage > 0 ? "Short " : "Excess "}
                            {inr(Math.abs(r.shortage))}
                          </span>
                        ) : (
                          <span className="text-success">Balanced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/50 font-bold">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.received)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.cash)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.cheque)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.voucher)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.admin)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.counters)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(totals.total)}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ================= WHAT IS OWED ================= */}
      <Card className="p-5">
        <SectionHeader
          icon={<Truck className="size-4" />}
          title="Owed to vendors right now"
          subtitle={`${owed.length} vendor${owed.length === 1 ? "" : "s"} · ₹${inr(owed.reduce((s, v) => s + v.balance.totalToPay, 0))} in total`}
        />
        {owed.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">Nothing is owed to any vendor.</div>
        ) : (
          <div className="mt-3 divide-y">
            {owed.map((v) => (
              <Link key={v._id} href={`/purchase/vendors/${v._id}`} className="flex items-center gap-3 py-2.5 hover:bg-secondary/40">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.name}</span>
                {v.balance.vouchersPending > 0.004 && <StatusChip tone="warning" dot={false}>₹{inr(v.balance.vouchersPending)} vouchers</StatusChip>}
                <span className="w-28 text-right text-sm font-semibold">₹{inr(v.balance.totalToPay)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Kpi({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? "text-lg font-semibold" : "text-base font-semibold"}`}>₹{inr(value)}</div>
    </Card>
  )
}
