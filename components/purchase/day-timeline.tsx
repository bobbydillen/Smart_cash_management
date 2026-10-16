"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SectionHeader from "@/components/section-header"
import { ArrowDownToLine, ArrowUpFromLine, Banknote, FileText, HandCoins, Landmark, ListTree, Ticket } from "lucide-react"
import { DENOMS } from "@/lib/next-day"
import { inr } from "@/lib/report"
import type { DayView } from "@/lib/purchase-service"

type Tone = "in" | "out" | "paid"

interface Event {
  at: string
  icon: React.ReactNode
  title: string
  detail: string
  by: string
  amount: number
  tone: Tone
  /** change to the purchase drawer's cash (0 when the drawer is not touched) */
  drawer: number
  tag?: string
  /** who this involves: the purchase counter, the admin, or a shop counter */
  parties: string[]
  kind: "received" | "payment" | "other"
  /** cash, cheque or voucher (cash received and other money in/out are always cash) */
  mode: "cash" | "cheque" | "voucher"
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })

function buildEvents(view: DayView): Event[] {
  const out: Event[] = []

  for (const m of view.day.cashIn) {
    const breakdown = m.denominations
      ? DENOMS.filter((d) => (m.denominations![d[1]] ?? 0) > 0)
          .map((d) => `${m.denominations![d[1]]}×${d[0]}`)
          .join("  ")
      : ""
    const received = m.kind === "received"
    out.push({
      at: m.time,
      icon: received ? <HandCoins className="size-4" /> : <ArrowDownToLine className="size-4" />,
      title: received ? `Cash received from ${m.party}` : m.kind === "other-in" ? `Money in: ${m.party}` : `Cash transfer from ${m.party}`,
      detail: [breakdown, m.note].filter(Boolean).join(" · "),
      by: m.by ?? "",
      amount: m.amount,
      tone: "in",
      drawer: m.amount,
      tag: received ? "Cash received" : m.kind ? "Money in" : "Transfer",
      parties: ["Purchase counter", m.kind ? "" : m.party, received ? m.party : ""].filter(Boolean),
      kind: m.kind === "other-in" ? "other" : "received",
      mode: "cash",
    })
  }

  for (const m of view.day.cashOut) {
    out.push({
      at: m.time,
      icon: <ArrowUpFromLine className="size-4" />,
      title: m.kind === "other-out" ? `Money out: ${m.party}` : `Cash sent to ${m.party}`,
      detail: m.note ?? "",
      by: m.by ?? "",
      amount: m.amount,
      tone: "out",
      drawer: -m.amount,
      tag: m.kind ? "Money out" : "Transfer",
      parties: ["Purchase counter", m.kind ? "" : m.party].filter(Boolean),
      kind: "other",
      mode: "cash",
    })
  }

  for (const p of view.payments) {
    const source = p.source ?? "purchase"
    const who = source === "counter" ? (p.sourceName ?? "Shop counter") : source === "admin" ? "Admin" : "Purchase counter"
    const what = p.billNumber ? `bill ${p.billNumber}` : p.settlesVoucherId ? "voucher settlement" : "on account"
    const mode = p.mode === "cash" ? "Cash" : p.mode === "cheque" ? `Cheque ${p.reference ?? ""}`.trim() : `Voucher ${p.reference ?? ""}`.trim()
    out.push({
      at: p.createdAt,
      icon: p.mode === "cash" ? <Banknote className="size-4" /> : p.mode === "cheque" ? <Landmark className="size-4" /> : <Ticket className="size-4" />,
      title: `Paid ${p.vendorName}`,
      detail: [`${mode} · ${what}`, p.note].filter(Boolean).join(" · "),
      by: source === "purchase" ? `${p.paidBy}` : `${who}${p.paidBy && source === "counter" ? ` · ${p.paidBy}` : ""}`,
      amount: p.amount,
      tone: "paid",
      // only cash paid by the purchase counter comes out of its drawer
      drawer: source === "purchase" && p.mode === "cash" ? -p.amount : 0,
      tag: who,
      parties: [who],
      kind: "payment",
      mode: p.mode,
    })
  }

  return out.sort((a, b) => a.at.localeCompare(b.at))
}

const TONE = {
  in: "bg-success-soft text-success",
  out: "bg-danger-soft text-danger",
  paid: "bg-accent text-accent-foreground",
} as const

/** Everything that happened on the purchase day, in the order it happened. */
export default function DayTimeline({ view }: { view: DayView }) {
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState("all")
  const [what, setWhat] = useState<"all" | "received" | "payment">("all")
  const [mode, setMode] = useState<"all" | "cash" | "cheque" | "voucher">("all")
  const events = useMemo(() => buildEvents(view), [view])

  // cash in the drawer after each step (worked out on everything, so filtering never changes it)
  const all = useMemo(() => {
    let running = view.summary.opening
    return events.map((e) => {
      running = Math.round((running + e.drawer) * 100) / 100
      return { ...e, balance: running }
    })
  }, [events, view.summary.opening])

  // the people who appear today: purchase counter and admin first, then shop counters
  const people = useMemo(() => {
    const set = new Set(all.flatMap((e) => e.parties))
    const rest = [...set].filter((n) => n !== "Purchase counter" && n !== "Admin").sort()
    return ["Purchase counter", "Admin", ...rest].filter((n) => n === "Purchase counter" || n === "Admin" || set.has(n))
  }, [all])

  const rows = all.filter(
    (e) => (who === "all" || e.parties.includes(who)) && (what === "all" || e.kind === what) && (mode === "all" || e.mode === mode)
  )
  const shown = rows.reduce((t, e) => t + (e.tone === "in" ? e.amount : 0), 0)
  const paid = rows.reduce((t, e) => t + (e.kind === "payment" ? e.amount : 0), 0)

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          icon={<ListTree className="size-4" />}
          title="Detailed report"
          subtitle={
            events.length === 0
              ? "Nothing happened yet"
              : `${events.length} event${events.length === 1 ? "" : "s"}: cash received, payments and who did them`
          }
        />
        {events.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            <FileText /> {open ? "Hide" : "Show"}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[["all", "Everyone"], ...people.map((n) => [n, n])].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setWho(v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  who === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([["all", "Everything"], ["received", "Cash received"], ["payment", "Payments"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setWhat(v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  what === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([["all", "All modes"], ["cash", "Cash"], ["cheque", "Cheque"], ["voucher", "Voucher"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  mode === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(who !== "all" || what !== "all" || mode !== "all") && (
            <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {rows.length} of {all.length} events · cash coming in ₹{inr(shown)} · paid to vendors ₹{inr(paid)}
            </p>
          )}
        </div>
      )}

      {open && rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
          Nothing matches this filter.
        </div>
      )}

      {open && rows.length > 0 && (
        <ol className="relative mt-4 space-y-3 border-l pl-5">
          {who === "all" && what === "all" && mode === "all" && (
          <li className="text-xs text-muted-foreground">
            <span className="absolute -left-[5px] mt-1 size-2.5 rounded-full border bg-card" />
            Opening cash <span className="font-medium text-foreground">₹{inr(view.summary.opening)}</span>
          </li>
          )}
          {rows.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[31px] grid size-6 place-items-center rounded-full ${TONE[e.tone]}`}>{e.icon}</span>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{e.title}</div>
                  {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {time(e.at)}
                    {e.by && ` · ${e.by}`}
                    {e.tag && <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground">{e.tag}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${e.tone === "in" ? "text-success" : e.tone === "out" ? "text-danger" : ""}`}>
                    {e.tone === "in" ? "+" : e.tone === "out" ? "−" : ""}₹{inr(e.amount)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {e.drawer === 0 ? "drawer unchanged" : `drawer ₹${inr(e.balance)}`}
                  </div>
                </div>
              </div>
            </li>
          ))}
          {who === "all" && what === "all" && mode === "all" && (
          <li className="text-xs text-muted-foreground">
            <span className="absolute -left-[5px] mt-1 size-2.5 rounded-full bg-foreground" />
            Cash in hand now <span className="font-medium text-foreground">₹{inr(view.summary.expected)}</span>
          </li>
          )}
        </ol>
      )}
    </Card>
  )
}
