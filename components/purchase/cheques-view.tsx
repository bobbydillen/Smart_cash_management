"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StatusChip from "@/components/status-chip"
import { Notice } from "@/components/notice"
import { AlertTriangle, Landmark, Plus, Printer, Settings2, X } from "lucide-react"
import { addBank, changeChequeStatus, toggleBank } from "@/app/actions/purchase"
import { daysFrom, relativeDay } from "./common"
import { addDays, inr, shortDate, todayIST, weekdayShort } from "@/lib/report"
import type { Bank, ChequeStatus } from "@/lib/purchase"
import type { ChequeRow } from "@/lib/purchase-service"

type Role = "purchase" | "admin" | "supervisor"
type Mode = "due" | "all"
type Preset = "today" | "tomorrow" | "7" | "30" | "custom"
type Filter = ChequeStatus | "all"

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "7", label: "Next 7 days" },
  { id: "30", label: "Next 30 days" },
  { id: "custom", label: "Custom" },
]
const FILTERS: { id: Filter; label: string }[] = [
  { id: "issued", label: "Waiting to clear" },
  { id: "cleared", label: "Cleared" },
  { id: "bounced", label: "Bounced" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
]
const TONE: Record<ChequeStatus, "info" | "success" | "danger" | "neutral"> = {
  issued: "info",
  cleared: "success",
  bounced: "danger",
  cancelled: "neutral",
}
const LABEL: Record<ChequeStatus, string> = {
  issued: "Issued",
  cleared: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
}

export default function ChequesView({ cheques, role, banks }: { cheques: ChequeRow[]; role: Role; banks: Bank[] }) {
  const router = useRouter()
  const today = todayIST()
  const [mode, setMode] = useState<Mode>("due")
  const [error, setError] = useState("")

  const act = async (id: string, status: "cleared" | "bounced" | "cancelled") => {
    setError("")
    const res = await changeChequeStatus(id, status)
    if (res.error) return setError(res.error)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {role !== "supervisor" && <BanksCard banks={banks} />}

      <div className="inline-flex rounded-lg border bg-card p-1 print:hidden">
        {(
          [
            ["due", "Cheques due"],
            ["all", "All cheques"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {mode === "due" ? (
        <DueView cheques={cheques} role={role} today={today} act={act} />
      ) : (
        <AllView cheques={cheques} role={role} today={today} act={act} />
      )}
    </div>
  )
}

/* ================= DUE: PLAN THE BANK BALANCE ================= */

function DueView({
  cheques,
  role,
  today,
  act,
}: {
  cheques: ChequeRow[]
  role: Role
  today: string
  act: (id: string, status: "cleared" | "bounced" | "cancelled") => void
}) {
  const [preset, setPreset] = useState<Preset>("today")
  const [bank, setBank] = useState("")
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 7))

  const range = useMemo(() => {
    if (preset === "today") return { start: today, end: today }
    if (preset === "tomorrow") return { start: addDays(today, 1), end: addDays(today, 1) }
    if (preset === "7") return { start: today, end: addDays(today, 7) }
    if (preset === "30") return { start: today, end: addDays(today, 30) }
    return { start: from <= to ? from : to, end: from <= to ? to : from }
  }, [preset, from, to, today])

  const waitingAll = cheques.filter((c) => c.status === "issued")
  const banksDue = [...new Set(waitingAll.map((c) => c.bank))].sort()
  // totals can be looked at for one bank at a time
  const waiting = bank ? waitingAll.filter((c) => c.bank === bank) : waitingAll
  const inRange = waiting
    .filter((c) => c.chequeDate >= range.start && c.chequeDate <= range.end)
    .sort((a, b) => a.chequeDate.localeCompare(b.chequeDate) || a.bank.localeCompare(b.bank))
  // dated earlier than today but never marked cleared: probably already debited
  const passed = waiting.filter((c) => c.chequeDate < today)

  const total = inRange.reduce((s, c) => s + c.amount, 0)

  const byDay = useMemo(() => {
    const map = new Map<string, ChequeRow[]>()
    for (const c of inRange) map.set(c.chequeDate, [...(map.get(c.chequeDate) || []), c])
    return [...map.entries()]
  }, [inRange])

  const byBank = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const c of inRange) {
      const cur = map.get(c.bank) || { total: 0, count: 0 }
      map.set(c.bank, { total: cur.total + c.amount, count: cur.count + 1 })
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [inRange])

  const rangeLabel =
    range.start === range.end ? shortDate(range.start) : `${shortDate(range.start)} – ${shortDate(range.end)}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                preset === p.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      {banksDue.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bank</span>
          {["", ...banksDue].map((b) => (
            <button
              key={b || "all"}
              onClick={() => setBank(b)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                bank === b ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {b || "All banks"}
            </button>
          ))}
        </div>
      )}

      {preset === "custom" && (
        <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-44" />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">Cheques dated on or between these days.</p>
        </Card>
      )}

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">
          Cheques due: {rangeLabel}
          {bank ? ` · ${bank}` : ""}
        </h1>
      </div>

      {/* ================= TOTAL TO HAVE IN THE BANK ================= */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Landmark className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">
              Bank balance needed{bank ? ` in ${bank}` : ""} · {rangeLabel}
            </div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight">₹{inr(total)}</div>
            <div className="text-sm text-muted-foreground">
              {inRange.length} cheque{inRange.length === 1 ? "" : "s"}
              {byDay.length > 1 && <> across {byDay.length} days</>}
            </div>
          </div>
        </div>

        {!bank && byBank.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By bank</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {byBank.map(([bank, v]) => (
                <div key={bank} className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                  <span>
                    {bank} <span className="text-muted-foreground">· {v.count}</span>
                  </span>
                  <span className="font-semibold">₹{inr(v.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ================= DATE PASSED ================= */}
      {passed.length > 0 && (
        <Card className="border-danger/30 bg-danger-soft p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-danger">
                {passed.length} cheque{passed.length === 1 ? "" : "s"} past the date, not marked cleared · ₹
                {inr(passed.reduce((s, c) => s + c.amount, 0))}
              </div>
              <p className="text-sm text-muted-foreground">These have probably been debited already. Mark them cleared once you see them in the bank.</p>
              <div className="mt-3 space-y-2">
                {passed.map((c) => (
                  <ChequeLine key={c._id} c={c} today={today} role={role} act={act} compact />
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ================= DUE, DAY BY DAY ================= */}
      {byDay.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">No cheques are due in this period.</Card>
      ) : (
        byDay.map(([date, list]) => (
          <Card key={date} className="p-5 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">
                  {weekdayShort(date)}, {shortDate(date)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {relativeDay(date, today)} · {list.length} cheque{list.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Due this day</div>
                <div className="text-lg font-semibold">₹{inr(list.reduce((s, c) => s + c.amount, 0))}</div>
              </div>
            </div>
            <div className="mt-3 divide-y">
              {list.map((c) => (
                <ChequeLine key={c._id} c={c} today={today} role={role} act={act} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}

/** One cheque with all its details. */
function ChequeLine({
  c,
  today,
  role,
  act,
  compact,
}: {
  c: ChequeRow
  today: string
  role: Role
  act: (id: string, status: "cleared" | "bounced" | "cancelled") => void
  compact?: boolean
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${compact ? "rounded-lg bg-card px-3 py-2" : "py-3"}`}>
      <div className="min-w-0 flex-1">
        <Link href={`/purchase/vendors/${c.vendorId}`} className="text-sm font-medium hover:underline">
          {c.vendorName}
        </Link>
        <div className="text-xs text-muted-foreground">
          {c.bank} · cheque {c.number}
          {c.billNumber && <> · bill {c.billNumber}</>}
        </div>
        <div className="text-xs text-muted-foreground">
          dated {shortDate(c.chequeDate)} · given {shortDate(c.issuedDate)}
          {c.paidBy && <> by {c.paidBy}</>}
          {c.note && <> · {c.note}</>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">₹{inr(c.amount)}</div>
        {c.chequeDate < today && <div className="text-xs text-danger">{relativeDay(c.chequeDate, today)}</div>}
      </div>
      {role !== "supervisor" && c.status === "issued" && (
        <div className="flex gap-1.5 print:hidden">
          <Button size="sm" variant="outline" onClick={() => act(c._id, "cleared")}>
            Cleared
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => confirm("Mark this cheque as bounced? The amount goes back to what we owe the vendor.") && act(c._id, "bounced")}
          >
            Bounced
          </Button>
        </div>
      )}
    </div>
  )
}

/* ================= BANKS ================= */

function BanksCard({ banks }: { banks: Bank[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const active = banks.filter((b) => b.active)
  const hidden = banks.filter((b) => !b.active)

  const add = async () => {
    setError("")
    setBusy(true)
    const res = await addBank(name)
    setBusy(false)
    if (res.error) return setError(res.error)
    setName("")
    router.refresh()
  }
  const toggle = async (b: Bank) => {
    if (b.active && !confirm(`Remove ${b.name} from the list? Old cheques keep their bank.`)) return
    await toggleBank(b._id, !b.active)
    router.refresh()
  }

  return (
    <Card className="p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Banks</span>
          {active.length === 0 ? (
            <span className="text-sm text-muted-foreground">None yet. Add the banks you issue cheques from.</span>
          ) : (
            active.map((b) => (
              <StatusChip key={b._id} tone="neutral" dot={false}>
                {b.name}
              </StatusChip>
            ))
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Settings2 /> {open ? "Done" : "Manage banks"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a bank, e.g. State Bank of India"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && add()}
            />
            <Button onClick={add} disabled={busy || !name.trim()}>
              <Plus /> Add
            </Button>
          </div>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          {active.length > 0 && (
            <div className="divide-y">
              {active.map((b) => (
                <div key={b._id} className="flex items-center justify-between py-2 text-sm">
                  <span>{b.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => toggle(b)}>
                    <X /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {hidden.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Removed</div>
              {hidden.map((b) => (
                <div key={b._id} className="flex items-center justify-between py-1.5 text-sm text-muted-foreground">
                  <span>{b.name}</span>
                  <Button variant="outline" size="sm" onClick={() => toggle(b)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/* ================= ALL CHEQUES ================= */

function AllView({
  cheques,
  role,
  today,
  act,
}: {
  cheques: ChequeRow[]
  role: Role
  today: string
  act: (id: string, status: "cleared" | "bounced" | "cancelled") => void
}) {
  const [filter, setFilter] = useState<Filter>("issued")

  const waiting = cheques.filter((c) => c.status === "issued")
  const waitingTotal = waiting.reduce((s, c) => s + c.amount, 0)
  const dueSoon = waiting.filter((c) => {
    const d = daysFrom(c.chequeDate, today)
    return d >= 0 && d <= 7
  })
  const datePassed = waiting.filter((c) => c.chequeDate < today)

  const shown = cheques
    .filter((c) => filter === "all" || c.status === filter)
    .sort((a, b) => (filter === "issued" ? a.chequeDate.localeCompare(b.chequeDate) : b.chequeDate.localeCompare(a.chequeDate)))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Waiting to clear" value={`₹${inr(waitingTotal)}`} sub={`${waiting.length} cheque${waiting.length === 1 ? "" : "s"}`} />
        <Kpi
          label="Due in the next 7 days"
          value={`₹${inr(dueSoon.reduce((s, c) => s + c.amount, 0))}`}
          sub={`${dueSoon.length} cheque${dueSoon.length === 1 ? "" : "s"}`}
          tone={dueSoon.length ? "warning" : undefined}
        />
        <Kpi
          label="Date has passed"
          value={`₹${inr(datePassed.reduce((s, c) => s + c.amount, 0))}`}
          sub={`${datePassed.length} not yet marked cleared`}
          tone={datePassed.length ? "danger" : undefined}
        />
        <Kpi label="Bounced" value={String(cheques.filter((c) => c.status === "bounced").length)} sub="all time" />
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

      {shown.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">No cheques here.</Card>
      ) : (
        <Card className="p-2">
          <div className="divide-y">
            {shown.map((c) => (
              <div key={c._id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/purchase/vendors/${c.vendorId}`} className="text-sm font-medium hover:underline">
                    {c.vendorName}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.bank} · {c.number}
                    {c.billNumber && <> · bill {c.billNumber}</>} · dated {shortDate(c.chequeDate)}
                    {c.status === "issued" && <> ({relativeDay(c.chequeDate, today)})</>}
                  </div>
                </div>
                <StatusChip tone={TONE[c.status]}>{LABEL[c.status]}</StatusChip>
                <div className="w-28 text-right text-sm font-semibold">₹{inr(c.amount)}</div>
                {role !== "supervisor" && c.status === "issued" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => act(c._id, "cleared")}>
                      Cleared
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm("Mark this cheque as bounced? The amount goes back to what we owe the vendor.") && act(c._id, "bounced")}
                    >
                      Bounced
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm("Cancel this cheque? The amount goes back to what we owe the vendor.") && act(c._id, "cancelled")}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" | "danger" }) {
  return (
    <Card className={`px-4 py-3 ${tone === "warning" ? "border-warning/30 bg-warning-soft" : tone === "danger" ? "border-danger/30 bg-danger-soft" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}
