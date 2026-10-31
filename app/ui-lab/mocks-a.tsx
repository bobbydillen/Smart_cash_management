import { ChevronRight, CircleUserRound, Menu, Minus, Plus, Check } from "lucide-react"
import { counter, denoms, difference, diffOf, expected, expectedOf, counted, inr, movements, purchase, rows, totals } from "./data"
import { Diff, Money, Pill, StatusPill, StepBtn } from "./shared"

/* Direction A: LEDGER. One continuous page. Neutral chrome, one near-black action, colour only on data and status.
   A running-totals strip stays at the bottom of every counting step. */

function Header({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Payments", "Sales", "Closing"]
  return (
    <header className="sticky top-0 z-10 border-b bg-card">
      <div className="flex items-center gap-3 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">{counter.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{counter.date}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" aria-hidden /> Opening verified by {counter.verifiedBy}</p>
        </div>
        <button aria-label="Menu" className="grid size-11 place-items-center rounded-lg hover:bg-secondary"><Menu className="size-5" /></button>
      </div>
      <nav aria-label="Day steps" className="mt-1 grid grid-cols-3 px-2">
        {steps.map((s, i) => (
          <button key={s} aria-current={step === i + 1 ? "step" : undefined} className={`flex h-12 items-center justify-center gap-2 border-b-2 text-sm font-medium ${step === i + 1 ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>
            <span className={`grid size-5 place-items-center rounded-full text-xs ${step === i + 1 ? "bg-foreground text-background" : "bg-secondary"}`}>{i + 1}</span>
            {s}
          </button>
        ))}
      </nav>
    </header>
  )
}

function TotalsStrip({ action }: { action?: string }) {
  return (
    <div className="sticky bottom-0 z-10 border-t bg-card px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2">
        <dl className="grid flex-1 grid-cols-3 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Expected</dt><dd className="font-semibold"><Money n={expected} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Counted</dt><dd className="font-semibold"><Money n={counted} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Difference</dt><dd><Diff value={difference} /></dd></div>
        </dl>
        {action && <button className="h-12 w-full rounded-lg bg-foreground px-6 text-sm font-semibold text-background @lg:w-auto">{action}</button>}
      </div>
    </div>
  )
}

export function CounterA() {
  return (
    <div className="flex min-h-[640px] flex-col bg-background text-foreground">
      <Header step={1} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <section className="rounded-xl border bg-card">
          <div className="flex items-baseline justify-between px-4 pt-4"><h2 className="text-base font-semibold">Cash movements</h2><span className="text-xs text-muted-foreground">Out of or into your drawer today</span></div>
          <ul className="mt-2 divide-y">
            {movements.map((m) => (
              <li key={m.what} className="flex items-center gap-3 px-4 py-3">
                <span className="w-11 text-xs tabular-nums text-muted-foreground">{m.time}</span>
                <span className="flex-1 text-sm">{m.what}</span>
                <span className="text-sm font-medium tabular-nums">−{inr(m.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 border-t p-4 @lg:grid-cols-[1fr_9rem_auto]">
            <input aria-label="What is it for" placeholder="What is it for?" className="h-12 rounded-lg border bg-card px-3 text-base" />
            <input aria-label="Amount" inputMode="decimal" placeholder="₹ 0" className="h-12 rounded-lg border bg-card px-3 text-right text-base tabular-nums" />
            <button className="h-12 rounded-lg border px-5 text-sm font-semibold">Add money out</button>
          </div>
        </section>
        <button className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left">
          <span className="flex-1"><span className="block text-base font-semibold">Pay a vendor's bill</span><span className="block text-sm text-muted-foreground">A vendor hands over a bill and you pay some or all of it in cash</span></span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </button>
      </main>
      <TotalsStrip />
    </div>
  )
}

export function ClosingA() {
  const notes = denoms.filter((d) => d.kind === "note")
  const coins = denoms.filter((d) => d.kind === "coin")
  const Group = ({ title, list }: { title: string; list: typeof denoms }) => (
    <section>
      <h2 className="mb-1 px-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="rounded-xl border bg-card">
        {list.map((d, i) => (
          <li key={d.label + d.kind} className={`flex h-16 items-center gap-2 px-3 ${i ? "border-t" : ""}`}>
            <span className="w-12 text-base font-semibold">{d.label}</span>
            <StepBtn label={`Fewer ${d.label}`}><Minus className="size-4" /></StepBtn>
            <input aria-label={`${d.label} ${d.kind} count`} inputMode="numeric" defaultValue={d.count} className="h-11 w-16 rounded-lg border bg-card text-center text-base font-semibold tabular-nums" />
            <StepBtn label={`More ${d.label}`}><Plus className="size-4" /></StepBtn>
            <span className="flex-1 text-right text-base tabular-nums">{inr(d.value * d.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <div className="flex min-h-[640px] flex-col bg-background text-foreground">
      <Header step={3} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Count the drawer</h2><p className="text-sm text-muted-foreground">Enter how many of each note and coin you have</p></div><span className="inline-flex items-center gap-1 text-xs text-success"><Check className="size-3.5" aria-hidden /> Saved</span></div>
        <Group title="Notes" list={notes} />
        <Group title="Coins" list={coins} />
      </main>
      <TotalsStrip action="Review and submit" />
    </div>
  )
}

export function AdminA() {
  const finding = `Counter 1 is ${inr(difference)} short and Counter 2 is ${inr(20)} over. ${rows.filter((r) => r.status === "submitted").length} days wait for your confirmation.`
  return (
    <div className="min-h-[640px] bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="grid size-9 place-items-center rounded-lg bg-foreground text-sm font-bold text-background">SC</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Smart Cash</p><p className="truncate text-xs text-muted-foreground">Smart Mart &amp; Smart Fashions</p></div>
          <button className="hidden h-10 rounded-lg border px-3 text-sm @3xl:block">Reports</button>
          <button className="hidden h-10 rounded-lg border px-3 text-sm @3xl:block">Purchase</button>
          <button className="hidden h-10 rounded-lg border px-3 text-sm @3xl:block">Reconciliation</button>
          <button aria-label="Menu" className="grid size-11 place-items-center rounded-lg hover:bg-secondary @3xl:hidden"><Menu className="size-5" /></button>
          <CircleUserRound className="hidden size-7 text-muted-foreground @3xl:block" aria-hidden />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Overview</h1><p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{finding}</p></div>
          <input aria-label="Date" defaultValue="31 Oct 2026" className="h-11 w-40 rounded-lg border bg-card px-3 text-sm" />
        </div>

        {/* figures, not tiles: one container split by hairlines */}
        <dl className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card @3xl:grid-cols-5 @3xl:divide-y-0">
          {[
            ["Total sales", inr(totals.sales)],
            ["Cash", inr(totals.cash)],
            ["Card / UPI", inr(totals.card)],
            ["Credit", inr(totals.credit)],
            ["Net difference", totals.netDiff < 0 ? `${inr(-totals.netDiff)} over` : `${inr(totals.netDiff)} short`],
          ].map(([k, v], i) => (
            <div key={k} className={`p-4 ${i === 0 ? "col-span-2 @3xl:col-span-1" : ""}`}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className={`mt-1 tabular-nums ${i === 0 ? "text-2xl font-semibold" : "text-xl font-medium"}`}>{v}</dd>
              {i === 4 && <p className="mt-0.5 text-xs text-muted-foreground">{totals.submitted} of 4 counters submitted</p>}
            </div>
          ))}
        </dl>

        <section>
          <h2 className="mb-2 text-base font-semibold">Counters</h2>
          {/* table from 896px, two-line list below */}
          <div className="hidden overflow-hidden rounded-xl border bg-card @4xl:block">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr className="border-b text-left"><th className="px-4 py-2.5 font-normal">Counter</th><th className="px-4 py-2.5 font-normal">Status</th><th className="px-4 py-2.5 text-right font-normal">Cash sales</th><th className="px-4 py-2.5 text-right font-normal">Expected</th><th className="px-4 py-2.5 text-right font-normal">Counted</th><th className="px-4 py-2.5 font-normal">Difference</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="h-14 border-b last:border-0">
                    <td className="px-4 font-medium">{r.name}</td>
                    <td className="px-4"><StatusPill status={r.status} /></td>
                    <td className="px-4 text-right tabular-nums">{inr(r.cash)}</td>
                    <td className="px-4 text-right tabular-nums">{inr(expectedOf(r))}</td>
                    <td className="px-4 text-right tabular-nums">{r.counted === null ? <span className="text-muted-foreground">—</span> : inr(r.counted)}</td>
                    <td className="px-4"><Diff value={diffOf(r)} /></td>
                    <td className="px-4 text-right">{r.status === "submitted" ? <button className="h-9 rounded-lg bg-foreground px-4 text-sm font-semibold text-background">Confirm</button> : <button className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary">Details</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y rounded-xl border bg-card @4xl:hidden">
            {rows.map((r) => (
              <li key={r.name} className="p-4">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{r.name}</span><StatusPill status={r.status} /></div>
                <div className="mt-2 flex items-center justify-between text-sm"><span className="tabular-nums text-muted-foreground">Expected {inr(expectedOf(r))}</span><Diff value={diffOf(r)} /></div>
                {r.status === "submitted" && <button className="mt-3 h-11 w-full rounded-lg bg-foreground text-sm font-semibold text-background">Confirm this day</button>}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Purchase counter</h2><StatusPill status="submitted" /></div>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm @3xl:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Paid to vendors in cash</dt><dd className="mt-0.5 text-lg font-medium tabular-nums">{inr(purchase.paidCash)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Cash in drawer</dt><dd className="mt-0.5 text-lg font-medium tabular-nums">{inr(purchase.drawer)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Kept for tomorrow</dt><dd className="mt-0.5 text-lg font-medium tabular-nums">{inr(purchase.kept)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Handed over to you</dt><dd className="mt-0.5 flex items-center gap-2 text-lg font-semibold tabular-nums">{inr(purchase.handover)} <Pill tone="warning">To collect</Pill></dd></div>
          </dl>
        </section>
      </main>
    </div>
  )
}
