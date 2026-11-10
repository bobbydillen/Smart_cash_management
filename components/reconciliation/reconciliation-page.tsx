"use client"

import { useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PageShell from "@/components/page-shell"
import { ShellBar } from "@/components/app-shell"
import SectionHeader from "@/components/section-header"
import StatusChip from "@/components/status-chip"
import { Notice } from "@/components/notice"
import { selectClass } from "@/components/purchase/common"
import { todayIST } from "@/lib/report"
import {
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Minus,
  Plus,
  Printer,
  ScanSearch,
  Smartphone,
  ArrowRightLeft,
  CalendarDays,
  Store,
} from "lucide-react"

/* ================= TYPES (what the engine sends back) ================= */

interface Issue {
  shop: string
  bill: string
  time: string
  net: number
  recorded_digital: number
  status: string
  note: string
  source?: string
}
interface Result {
  date: string
  total_net: number
  total_digital: number
  implied_cash: number
  issues: Issue[]
  unassigned: {
    amount: number
    source: string
    ref: string
    time: string
    suspects: { shop: string; bill: string; time: string; net: number; gap_min: number | null; total: number }[]
  }[]
  splits: { shop: string; bill: string; time: string; net: number; digital: number; cash: number; source: string; note?: string }[]
  proof: {
    card_by_shop: Record<string, number>
    received_by_source: Record<string, number>
    total_card: number
    total_received: number
    difference: number
    unmatched_bills: number
    unassigned_payments: number
    amount_differences: number
    unexplained: number
  }
  shops: Record<string, { bills: number; net: number; recorded_card: number; confirmed_digital: number; implied_cash: number }>
  sources: Record<string, { count: number; total: number; per_shop: Record<string, number> }>
  xlsx: string
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const MAX_BANKS = 6
const MAX_MACHINES = 8

/** "620 1,200 ₹300" or lines like "17:03,620,097776" -> the amounts (mirrors the server) */
function parseAmounts(text: string): number[] {
  const out: number[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line || /^time/i.test(line)) continue
    if (/^[\d.,\s₹]*(?:rs\.?)?[\d.,\s]*$/i.test(line)) {
      for (const t of line.replace(/₹|rs\./gi, " ").split(/\s+/)) {
        const v = parseFloat(t.replace(/,/g, ""))
        if (v > 0) out.push(v)
      }
    } else {
      const p = line.split(",").map((x) => x.trim())
      const v = parseFloat(p[0].includes(":") ? p[1] : p[0])
      if (v > 0) out.push(v)
    }
  }
  return out
}

/* ================= SMALL PIECES ================= */

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>
}

/** Click or drop one or more files. */
function DropZone({
  title,
  hint,
  accept,
  multiple,
  files,
  onFiles,
  icon,
}: {
  title: string
  hint: string
  accept: string
  multiple?: boolean
  files: File[]
  onFiles: (f: File[]) => void
  icon: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const has = files.length > 0
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
        has ? "border-success/50 bg-success-soft" : over ? "border-primary bg-accent" : "bg-card hover:bg-accent/50"
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const dropped = Array.from(e.dataTransfer.files)
        if (dropped.length) onFiles(multiple ? dropped : dropped.slice(0, 1))
      }}
    >
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${has ? "bg-success text-white" : "bg-accent text-accent-foreground"}`}>
        {has ? <Check className="size-4" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {has ? files.map((f) => f.name).join(", ") : hint}
        </span>
      </span>
    </label>
  )
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button type="button" variant="outline" size="icon" className="size-8 rounded-full" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Fewer">
        <Minus />
      </Button>
      <output className="w-6 text-center text-sm font-semibold">{value}</output>
      <Button type="button" variant="outline" size="icon" className="size-8 rounded-full" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        <Plus />
      </Button>
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">{n}</div>
}

/* ================= RESULTS ================= */

const isInfo = (st: string) => st.startsWith("Matched - ") && !st.includes("Review")
function pillFor(st: string): { tone: "danger" | "warning" | "info" | "success"; text: string } {
  if (st.includes("Unmatched")) return { tone: "danger", text: "Unmatched" }
  if (st.includes("Excess")) return { tone: "warning", text: "Excess digital" }
  if (st.includes("Cross")) return { tone: "info", text: "Cross-shop" }
  if (st.includes("Amount Differs")) return { tone: "warning", text: "Amount differs" }
  if (st.includes("Time Gap")) return { tone: "warning", text: "Time gap" }
  if (st.includes("Combined")) return { tone: "info", text: "Combined payment" }
  if (st.includes("Split")) return { tone: "info", text: "Split payment" }
  return { tone: "success", text: st }
}

function Table({ heads, rows, num = [] }: { heads: string[]; rows: React.ReactNode[][]; num?: number[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {heads.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-semibold ${num.includes(i) ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${num.includes(j) ? "text-right tabular-nums" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ label, value, sub, tone, bar }: { label: string; value: string; sub: string; tone?: "warning"; bar?: number }) {
  return (
    <Card className={`p-4 ${tone === "warning" ? "border-warning/30 bg-warning-soft" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-success" style={{ width: `${bar}%` }} />
        </div>
      )}
    </Card>
  )
}

function Results({ s }: { s: Result }) {
  const shops = Object.keys(s.shops)
  const pct = s.total_net ? Math.min(100, (s.total_digital / s.total_net) * 100) : 0
  const issues = s.issues.filter((i) => !isInfo(i.status))
  const cross = s.issues.filter((i) => isInfo(i.status))
  const bills = shops.reduce((a, n) => a + s.shops[n].bills, 0)

  const download = () => {
    const bin = atob(s.xlsx)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    a.download = `Reconciliation_${s.date}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const pill = (st: string) => {
    const p = pillFor(st)
    return <StatusChip tone={p.tone}>{p.text}</StatusChip>
  }

  return (
    <div id="results" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Results · {s.date}</h2>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button size="sm" onClick={download}>
            <Download /> Download Excel report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total net sales" value={inr(s.total_net)} sub={`${bills} bills across ${shops.length} shop${shops.length === 1 ? "" : "s"}`} />
        <Kpi label="Digital confirmed" value={inr(s.total_digital)} sub={`${pct.toFixed(0)}% of sales matched to a payment`} bar={pct} />
        <Kpi label="Implied cash" value={inr(s.implied_cash)} sub="Net sales − digital. Not a cash count." tone="warning" />
        <Kpi
          label="Needs a look"
          value={String(issues.length)}
          sub={`${s.unassigned.length} unassigned payment${s.unassigned.length === 1 ? "" : "s"} · ${cross.length} auto-explained`}
        />
      </div>

      <Card className="p-5">
        <SectionHeader title="Proof: card sales − money received" subtitle="Every shop's card/digital sales minus Federal Bank, PhonePe, card machines and transfers. The gap must be fully explained." />
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {([
                ...Object.entries(s.proof.card_by_shop).map(([n, v]) => ["Card sales · " + n, v, false] as const),
                ["A. Total card sales", s.proof.total_card, true],
                ...Object.entries(s.proof.received_by_source).map(([n, v]) => ["Received · " + n, v, false] as const),
                ["B. Total money received", s.proof.total_received, true],
                ["Difference (A − B)", s.proof.difference, true],
                ["+ Bills marked card but no payment", s.proof.unmatched_bills, false],
                ["− Payments that match no bill", -s.proof.unassigned_payments, false],
                ["− Amount differences on matched bills", -s.proof.amount_differences, false],
              ] as const).map(([label, v, bold], i) => (
                <tr key={i} className={bold ? "font-semibold" : ""}>
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Math.abs(s.proof.unexplained) < 0.005 ? (
          <div className="mt-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">✓ Fully explained: nothing is left unexplained. Review the items below to decide what each one is.</div>
        ) : (
          <div role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            ⚠ {inr(Math.abs(s.proof.unexplained))} is unexplained, so something is wrong with the inputs (missing or duplicated file?).
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader title="Items needing a look" subtitle="Bills whose digital payment could not be confirmed" />
        {issues.length ? (
          <Table
            heads={["Shop", "Bill", "Time", "Net", "Recorded digital", "Status", "What to check"]}
            num={[3, 4]}
            rows={issues.map((i) => [i.shop, i.bill, i.time, inr(i.net), inr(i.recorded_digital), pill(i.status), <span key="n" className="text-muted-foreground">{i.note}</span>])}
          />
        ) : (
          <div className="mt-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">✓ No bills need review.</div>
        )}
      </Card>

      {s.unassigned.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title={`${s.unassigned.length} payment${s.unassigned.length === 1 ? "" : "s"} matched no bill · ${inr(s.unassigned.reduce((a, p) => a + p.amount, 0))}`}
            subtitle="Money arrived but fits no bill. Check for a missing bill, duplicate or tip."
          />
          <Table
            heads={["Amount", "Source", "Reference", "Time / date", "Likely explanation"]}
            num={[0]}
            rows={s.unassigned.map((p) => [
              inr(p.amount),
              p.source,
              p.ref,
              p.time,
              p.suspects?.length ? (
                <div key="x" className="min-w-[18rem] space-y-1">
                  {p.suspects.map((x, k) => (
                    <div key={k}>
                      Bill <b>{x.bill}</b> ({x.shop}, {x.time}, {inr(x.net)}) was marked as <b>cash</b>, but this was paid through <b>{p.source}</b>
                      {x.gap_min != null ? ` (${x.gap_min} min from the bill)` : ""}.
                    </div>
                  ))}
                  {p.suspects[0].total > p.suspects.length ? (
                    <div className="text-xs text-muted-foreground">…and {p.suspects[0].total - p.suspects.length} more cash bills with this exact amount</div>
                  ) : p.suspects.length > 1 ? (
                    <div className="text-xs text-muted-foreground">Only one of these can be the right bill.</div>
                  ) : null}
                </div>
              ) : (
                <span key="x" className="text-xs text-muted-foreground">No cash bill with this amount: a test payment, or a bill that is missing.</span>
              ),
            ])}
          />
        </Card>
      )}

      {s.splits?.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title={`${s.splits.length} bill${s.splits.length === 1 ? "" : "s"} paid part cash, part digital`}
            subtitle={`Digital part ${inr(s.splits.reduce((a, x) => a + x.digital, 0))} is checked against payments; cash part ${inr(s.splits.reduce((a, x) => a + x.cash, 0))} (Net − Card) is accepted as cash received.`}
          />
          <Table
            heads={["Shop", "Bill", "Time", "Net", "Paid digitally", "Cash part", "Digital via", ""]}
            num={[3, 4, 5]}
            rows={s.splits.map((x) => [x.shop, x.bill, x.time, inr(x.net), inr(x.digital), inr(x.cash), x.source, x.note ? <StatusChip key="r" tone="success">rounding</StatusChip> : ""])}
          />
        </Card>
      )}

      <Card className="p-5">
        <SectionHeader title="By shop" />
        <Table
          heads={["Shop", "Bills", "Net sales", "Till 'Card' total", "Digital confirmed", "Implied cash"]}
          num={[1, 2, 3, 4, 5]}
          rows={shops.map((n) => {
            const v = s.shops[n]
            return [n, v.bills, inr(v.net), inr(v.recorded_card), inr(v.confirmed_digital), inr(v.implied_cash)]
          })}
        />
      </Card>

      <Card className="p-5">
        <SectionHeader title="Where each source's money went" subtitle="Amounts under a shop other than the source's usual one are cross-shop routing" />
        <Table
          heads={["Source", "Transactions", "Total", ...shops.map((x) => "→ " + x)]}
          num={[1, 2, ...shops.map((_, i) => i + 3)]}
          rows={Object.entries(s.sources).map(([n, v]) => [n, v.count, inr(v.total), ...shops.map((x) => inr(v.per_shop[x] || 0))])}
        />
      </Card>

      {cross.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title={`${cross.length} bill${cross.length === 1 ? "" : "s"} matched in a special way`}
            subtitle="Money confirmed received: paid via another shop's source, together with other bills, or in several parts. Quick glance recommended."
          />
          <Table
            heads={["Shop", "Bill", "Time", "Net", "Source", "Status", "Details"]}
            num={[3]}
            rows={cross.map((i) => [i.shop, i.bill, i.time, inr(i.net), i.source ?? "", pill(i.status), <span key="n" className="text-muted-foreground">{i.note}</span>])}
          />
        </Card>
      )}
    </div>
  )
}

/* ================= THE PAGE ================= */

interface Bank {
  label: string
  hint: string
  files: File[]
}
interface Machine {
  label: string
  hint: string
  text: string
  csv: File[]
}

const newBank = (i: number): Bank => ({ label: `Federal Bank - Account ${i + 1}`, hint: "", files: [] })
const newMachine = (i: number): Machine => ({ label: `Card Machine ${i + 1}`, hint: "", text: "", csv: [] })

export default function ReconciliationPage({ token }: { token: string | null }) {
  const [date, setDate] = useState(todayIST())
  const [shopsText, setShopsText] = useState("Smart Mart, Smart Fashions")
  const [posFiles, setPosFiles] = useState<Record<string, File[]>>({})
  const [banks, setBanks] = useState<Bank[]>([newBank(0), newBank(1)])
  const [ppFiles, setPpFiles] = useState<File[]>([])
  const [machines, setMachines] = useState<Machine[]>([newMachine(0)])
  const [transfers, setTransfers] = useState("")
  const [combos, setCombos] = useState(true)
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)

  const shops = useMemo(() => shopsText.split(",").map((s) => s.trim()).filter(Boolean), [shopsText])

  const posDone = shops.filter((s) => (posFiles[s] ?? []).length > 0).length
  const paySources =
    banks.filter((b) => b.files.length > 0).length +
    (ppFiles.length > 0 ? 1 : 0) +
    machines.filter((m) => m.csv.length > 0 || m.text.trim()).length +
    (transfers.trim() ? 1 : 0)
  const ready = !!token && shops.length > 0 && posDone === shops.length && paySources > 0

  const resizeList = <T,>(list: T[], n: number, make: (i: number) => T): T[] =>
    n < list.length ? list.slice(0, n) : [...list, ...Array.from({ length: n - list.length }, (_, k) => make(list.length + k))]

  const patchBank = (i: number, p: Partial<Bank>) => setBanks((l) => l.map((b, k) => (k === i ? { ...b, ...p } : b)))
  const patchMachine = (i: number, p: Partial<Machine>) => setMachines((l) => l.map((m, k) => (k === i ? { ...m, ...p } : m)))

  const run = async () => {
    if (!token) return
    setError("")
    setResult(null)
    const fd = new FormData()
    fd.append("date", date)
    fd.append("shops", shops.join(","))
    shops.forEach((s, i) => {
      const f = posFiles[s]?.[0]
      if (f) fd.append(`pos_${i}`, f)
    })
    fd.append("n_banks", String(banks.length))
    banks.forEach((b, j) => {
      fd.append(`blabel_${j}`, b.label)
      fd.append(`bhint_${j}`, shops.includes(b.hint) ? b.hint : "")
      b.files.forEach((f) => fd.append(`bank_${j}`, f))
    })
    ppFiles.forEach((f) => fd.append("phonepe", f))
    fd.append("n_machines", String(machines.length))
    machines.forEach((m, j) => {
      fd.append(`mlabel_${j}`, m.label)
      fd.append(`mhint_${j}`, shops.includes(m.hint) ? m.hint : "")
      fd.append(`mtext_${j}`, m.text)
      if (m.csv[0]) fd.append(`mcsv_${j}`, m.csv[0])
    })
    fd.append("transfers", transfers)
    fd.append("combos", combos ? "1" : "0")

    setRunning(true)
    setSeconds(0)
    const t0 = Date.now()
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - t0) / 1000)), 1000)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 180000)
    try {
      const r = await fetch("/api/recon", { method: "POST", body: fd, headers: { "X-Recon-Token": token }, signal: ctl.signal })
      let data: any = {}
      try {
        data = await r.json()
      } catch {
        data = { error: `Server error (${r.status}).` }
      }
      if (!r.ok) {
        setError(data.error || "Something went wrong.")
      } else {
        setResult(data as Result)
        setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50)
      }
    } catch (e: any) {
      setError(e?.name === "AbortError" ? "Timed out after 3 minutes. Try again with smaller files." : "Cannot reach the reconciliation service. Check your connection and try again.")
    } finally {
      clearTimeout(timer)
      clearInterval(tick)
      setRunning(false)
    }
  }

  const shopSelect = (value: string, onChange: (v: string) => void) => (
    <select aria-label="Mainly used by (optional)" className={selectClass} value={shops.includes(value) ? value : ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not sure</option>
      {shops.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )

  return (
    <PageShell
      page="reconciliation"
      hasBottomBar
      title="Payments reconciliation"
      subtitle="Match the day's sales against bank, PhonePe and card payments"
      width="max-w-4xl"
    >
      <div className="space-y-5">
        {!token && (
          <Notice tone="danger">
            The reconciliation is not set up on this server yet: add <b>RECON_SECRET</b> to the project's environment variables and redeploy.
          </Notice>
        )}

        <p className="text-sm text-muted-foreground print:hidden">
          Upload the day's files and run the check. Every payment from every source is matched against all shops' bills together, so cross-shop payments and
          extra card machines are handled automatically. Split payments are not flagged.
        </p>

        <div className="space-y-5 print:hidden">
          {/* STEP 1 */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <StepBadge n={1} />
              <SectionHeader title="Day & shops" subtitle="Which day are you reconciling?" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Business date</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Business date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div>
                <Label>Shop names (comma separated)</Label>
                <div className="relative">
                  <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Shop names, comma separated" value={shopsText} onChange={(e) => setShopsText(e.target.value)} className="pl-9" />
                </div>
              </div>
            </div>
          </Card>

          {/* STEP 2 */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <StepBadge n={2} />
              <SectionHeader title="Billing exports" subtitle="One sales Excel file per shop" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {shops.map((s) => (
                <DropZone
                  key={s}
                  title={s}
                  hint="Drop sales Excel (.xlsx) or click"
                  accept=".xlsx"
                  icon={<FileSpreadsheet className="size-4" />}
                  files={posFiles[s] ?? []}
                  onFiles={(f) => setPosFiles((p) => ({ ...p, [s]: f }))}
                />
              ))}
              {shops.length === 0 && <p className="text-sm text-muted-foreground">Enter at least one shop name above.</p>}
            </div>
          </Card>

          {/* STEP 3 */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <StepBadge n={3} />
              <SectionHeader title="Payment sources" subtitle="Add everything that received money today" />
            </div>

            {/* banks */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Landmark className="size-4 text-muted-foreground" /> Bank accounts
                <span className="text-xs font-normal text-muted-foreground">Federal Bank statement PDFs</span>
              </div>
              <Stepper value={banks.length} max={MAX_BANKS} label="Number of bank accounts" onChange={(n) => setBanks((l) => resizeList(l, n, newBank))} />
            </div>
            <div className="mt-3 space-y-3">
              {banks.map((b, j) => (
                <div key={j} className="rounded-xl border bg-secondary/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account {j + 1}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Account name</Label>
                      <Input aria-label="Account name" value={b.label} onChange={(e) => patchBank(j, { label: e.target.value })} />
                    </div>
                    <div>
                      <Label>Mainly used by (optional)</Label>
                      {shopSelect(b.hint, (v) => patchBank(j, { hint: v }))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <DropZone
                      title="Statement PDF(s)"
                      hint="Drop PDF or click"
                      accept=".pdf"
                      multiple
                      icon={<Landmark className="size-4" />}
                      files={b.files}
                      onFiles={(f) => patchBank(j, { files: f })}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* phonepe */}
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-muted-foreground" /> PhonePe / EDC settlement
            </div>
            <div className="mt-3">
              <DropZone
                title="Settlement CSV(s)"
                hint="Drop one or more PhonePe / EDC CSVs"
                accept=".csv"
                multiple
                icon={<Smartphone className="size-4" />}
                files={ppFiles}
                onFiles={setPpFiles}
              />
            </div>

            {/* card machines */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4 text-muted-foreground" /> Card machines
                <span className="text-xs font-normal text-muted-foreground">just type the amounts from the slip</span>
              </div>
              <Stepper value={machines.length} max={MAX_MACHINES} label="Number of card machines" onChange={(n) => setMachines((l) => resizeList(l, n, newMachine))} />
            </div>
            <div className="mt-3 space-y-3">
              {machines.map((m, j) => {
                const amounts = parseAmounts(m.text)
                return (
                  <div key={j} className="rounded-xl border bg-secondary/40 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Machine {j + 1}</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Machine name</Label>
                        <Input aria-label="Machine name" value={m.label} onChange={(e) => patchMachine(j, { label: e.target.value })} />
                      </div>
                      <div>
                        <Label>Mainly used by (optional)</Label>
                        {shopSelect(m.hint, (v) => patchMachine(j, { hint: v }))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label>Card payments from the slip: just type the amounts</Label>
                      <textarea aria-label="Card payments from the slip: type the amounts"
                        rows={4}
                        inputMode="decimal"
                        value={m.text}
                        onChange={(e) => patchMachine(j, { text: e.target.value })}
                        placeholder={"One amount per line, or separated by spaces:\n620\n2200\n1860"}
                        className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                      <div className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                        {amounts.length
                          ? `${amounts.length} payment${amounts.length === 1 ? "" : "s"} · total ${inr(amounts.reduce((x, y) => x + y, 0))} (check against the slip total)`
                          : "No amounts yet"}
                      </div>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-accent-foreground">Optional: add time / reference, or upload a CSV</summary>
                      <p className="my-2 text-xs text-muted-foreground">
                        Time and reference are never required. To add them, write a line like <code>17:03,620,097776</code> (time, amount, ref); it can be mixed
                        with plain amounts. Or upload a CSV instead.
                      </p>
                      <DropZone
                        title="Slip CSV (optional)"
                        hint="Columns: time, amount, ref"
                        accept=".csv"
                        icon={<CreditCard className="size-4" />}
                        files={m.csv}
                        onFiles={(f) => patchMachine(j, { csv: f })}
                      />
                    </details>
                  </div>
                )
              })}
            </div>

            <label className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={combos} onChange={(e) => setCombos(e.target.checked)} className="mt-1 size-4" />
              <span>
                <b className="text-foreground">Also detect combined / split payments</b> (one payment for several bills, or one bill paid in parts). Untick to match only one payment to one bill. Payments under ₹20 are never merged.
              </span>
            </label>

            {/* transfers */}
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold">
              <ArrowRightLeft className="size-4 text-muted-foreground" /> Direct bank transfers
              <span className="text-xs font-normal text-muted-foreground">optional</span>
            </div>
            <textarea aria-label="Direct bank transfers: one amount per line"
              rows={3}
              value={transfers}
              onChange={(e) => setTransfers(e.target.value)}
              placeholder={"Amount per line, e.g.\n1200\nOptional note: 1200,Ramesh transfer"}
              className="mt-3 w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Card>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger print:hidden">
            ⚠️ {error}
          </div>
        )}

        {result && <Results s={result} />}
      </div>

      {/* run bar */}
      <div className="print:hidden">
        <ShellBar>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <StatusChip tone={shops.length > 0 && posDone === shops.length ? "success" : "neutral"} dot={false}>
              {shops.length > 0 && posDone === shops.length ? "✓" : "○"} Billing {posDone}/{shops.length}
            </StatusChip>
            <StatusChip tone={paySources > 0 ? "success" : "neutral"} dot={false}>
              {paySources > 0 ? "✓" : "○"} {paySources} payment source{paySources === 1 ? "" : "s"}
            </StatusChip>
          </div>
          <Button size="lg" onClick={run} disabled={!ready || running}>
            {running ? (
              <>
                <Loader2 className="animate-spin" /> Reconciling… {seconds}s
              </>
            ) : (
              <>
                <ScanSearch /> Run reconciliation
              </>
            )}
          </Button>
        </div>
        </ShellBar>
      </div>
    </PageShell>
  )
}
