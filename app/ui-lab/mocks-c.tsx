import { ArrowRight, Check, ChevronRight, CircleDot, Delete, Lock } from "lucide-react"
import { counter, day, denoms, difference, diffOf, expected, expectedOf, counted, inr, movements, purchase, rows, totals } from "./data"
import { Diff, LockedNote, Money, Pill, StatusPill } from "./shared"

/* Direction C: GUIDED. The day is a checklist with one current step, a visible lock on what is not ready,
   a number keypad for counting, and for the admin a queue of what needs a decision before any table. */

type StepState = "done" | "current" | "locked"
function Step({ n, title, detail, state, action, why }: { n: number; title: string; detail: string; state: StepState; action?: string; why?: string }) {
  return (
    <li className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${state === "current" ? "border-foreground bg-card" : state === "locked" ? "bg-secondary/50" : "bg-card"}`}>
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${state === "done" ? "bg-success-soft text-success" : state === "current" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
        {state === "done" ? <Check className="size-4" aria-label="Done" /> : state === "locked" ? <Lock className="size-4" aria-label="Locked" /> : n}
      </span>
      <div className="min-w-0 flex-1 basis-44">
        <p className={`text-base font-semibold ${state === "locked" ? "text-muted-foreground" : ""}`}>{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {state === "locked" && why && <div className="mt-1"><LockedNote>{why}</LockedNote></div>}
      </div>
      {state === "done" && <button className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary">Edit</button>}
      {state === "current" && action && <button className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background @lg:h-11 @lg:w-auto">{action}<ArrowRight className="size-4" aria-hidden /></button>}
    </li>
  )
}

export function CounterC() {
  const done = 3
  return (
    <div className="min-h-[640px] bg-background text-foreground">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{counter.name}</h1><p className="truncate text-xs text-muted-foreground">{counter.date}</p></div>
          <Pill tone="info"><CircleDot className="size-3.5" aria-hidden /> Day open</Pill>
        </div>
        <div className="mx-auto mt-3 max-w-4xl">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground"><span>{done} of 6 steps done</span><span>Next: count the drawer</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={6} aria-label="Day progress"><div className="h-full rounded-full bg-foreground" style={{ width: `${(done / 6) * 100}%` }} /></div>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-4 p-4 @3xl:grid-cols-[1fr_16rem]">
        <ol className="space-y-2">
          <Step n={1} state="done" title="Opening cash verified" detail={`${inr(day.opening)} counted by ${counter.verifiedBy}`} />
          <Step n={2} state="done" title="Payments" detail={`${movements.length} entries · ${inr(day.moneyOut)} paid out`} />
          <Step n={3} state="done" title="Sales" detail={`${inr(day.cashSales + day.cardUpi + day.credit)} entered · cash sales ${inr(day.cashSales)}`} />
          <Step n={4} state="current" title="Count the drawer" detail={`${inr(counted)} counted so far`} action="Continue counting" />
          <Step n={5} state="locked" title="Choose tomorrow's opening cash" detail="Decide what stays in the drawer" why="Unlocks once the count is saved" />
          <Step n={6} state="locked" title="Check, sign and submit" detail="Tick the cash you hand over, then submit" why="Unlocks after step 5" />
        </ol>
        <aside className="h-fit rounded-xl border bg-card p-4 @3xl:sticky @3xl:top-4">
          <h2 className="text-sm font-semibold">Cash right now</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Expected</dt><dd className="font-medium tabular-nums">{inr(expected)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Counted</dt><dd className="font-medium tabular-nums">{inr(counted)}</dd></div>
            <div className="flex items-center justify-between border-t pt-2"><dt className="text-muted-foreground">Difference</dt><dd><Diff value={difference} /></dd></div>
          </dl>
        </aside>
      </main>
    </div>
  )
}

export function ClosingC() {
  const active = 0
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "Next"]
  return (
    <div className="flex min-h-[640px] flex-col bg-background text-foreground">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3"><button className="h-10 rounded-lg px-2 text-sm text-muted-foreground">‹ Checklist</button><h1 className="flex-1 text-center text-base font-semibold">Count the drawer</h1><span className="inline-flex items-center gap-1 text-xs text-success"><Check className="size-3.5" aria-hidden /> Saved</span></div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-hidden p-3">
        <ul className="divide-y rounded-xl border bg-card">
          {denoms.map((d, i) => (
            <li key={d.label + d.kind}>
              <button aria-current={i === active} className={`flex h-12 w-full items-center gap-3 px-4 text-left ${i === active ? "bg-accent" : ""}`}>
                <span className="w-16 text-base font-semibold">{d.label}<span className="ml-1 text-xs font-normal text-muted-foreground">{d.kind === "coin" ? "coin" : ""}</span></span>
                <span className="flex-1 text-right text-base font-semibold tabular-nums">{d.count}</span>
                <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">{inr(d.value * d.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* the keypad: tap a row, type the number */}
      <div className="border-t bg-card pb-2">
        <div className="mx-auto max-w-3xl px-3 pt-2">
          <div className="flex items-center justify-between px-1 pb-2 text-sm"><span className="text-muted-foreground">Counting <b className="text-foreground">₹500</b> notes</span><span className="text-lg font-semibold tabular-nums">98 <span className="text-sm font-normal text-muted-foreground">= {inr(98 * 500)}</span></span></div>
          <div className="grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <button key={k} aria-label={k === "⌫" ? "Delete a digit" : k === "Next" ? "Next denomination" : k} className={`grid h-14 place-items-center rounded-lg text-xl font-semibold ${k === "Next" ? "bg-foreground text-base text-background" : "border bg-card"}`}>
                {k === "⌫" ? <Delete className="size-5" aria-hidden /> : k}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"><span>Counted <Money n={counted} className="font-semibold" /> of <Money n={expected} /></span><Diff value={difference} /></div>
        </div>
      </div>
    </div>
  )
}

export function AdminC() {
  const queue = [
    { id: 1, title: "Confirm Smart Mart Counter 1", detail: "Submitted 21:12 · counted ₹62,965 of ₹62,970", diff: diffOf(rows[0]), action: "Confirm" },
    { id: 2, title: "Confirm Smart Mart Counter 2", detail: "Submitted 21:30 · counted ₹48,820 of ₹48,800", diff: diffOf(rows[1]), action: "Confirm" },
    { id: 3, title: "Collect the purchase counter's cash", detail: `${inr(purchase.handover)} handed over · ${inr(purchase.kept)} kept for tomorrow`, diff: null, action: "Mark received" },
    { id: 4, title: "Smart Mart Fancy has not submitted", detail: "Opened 09:05 · sales ₹18,010 entered, drawer not counted", diff: null, action: "Open" },
  ]
  return (
    <div className="min-h-[640px] bg-background text-foreground">
      <header className="border-b bg-card px-4 py-3"><div className="mx-auto flex max-w-5xl items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-foreground text-sm font-bold text-background">SC</div><div className="flex-1"><h1 className="text-base font-semibold leading-tight">Today</h1><p className="text-xs text-muted-foreground">Saturday, 31 October 2026</p></div><input aria-label="Date" defaultValue="31 Oct" className="h-10 w-28 rounded-lg border bg-card px-3 text-sm" /></div></header>
      <main className="mx-auto max-w-5xl space-y-5 p-4">
        <section aria-labelledby="needs">
          <h2 id="needs" className="mb-2 text-base font-semibold">Needs you <span className="ml-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">{queue.length}</span></h2>
          <ul className="divide-y rounded-xl border bg-card">
            {queue.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{q.title}</p><p className="text-xs text-muted-foreground">{q.detail}</p>{q.diff !== null && <div className="mt-1"><Diff value={q.diff} /></div>}</div>
                <button className={`h-11 rounded-lg px-5 text-sm font-semibold ${q.action === "Open" ? "border" : "bg-foreground text-background"}`}>{q.action}</button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="all">
          <h2 id="all" className="mb-2 text-base font-semibold">All counters</h2>
          <ul className="grid gap-2 @3xl:grid-cols-2">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.name}</p><p className="text-xs tabular-nums text-muted-foreground">Sales {inr(r.total)} · expected {inr(expectedOf(r))}</p></div>
                <StatusPill status={r.status} />
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </li>
            ))}
          </ul>
        </section>

        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">Total sales <b className="text-foreground tabular-nums">{inr(totals.sales)}</b> · cash {inr(totals.cash)} · card/UPI {inr(totals.card)} · credit {inr(totals.credit)} · {totals.netDiff < 0 ? `${inr(-totals.netDiff)} over` : `${inr(totals.netDiff)} short`} across the {totals.submitted} counters that have submitted.</p>
      </main>
    </div>
  )
}
