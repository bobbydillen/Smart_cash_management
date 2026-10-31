import { BarChart3, Check, ChevronUp, ClipboardCheck, CreditCard, Landmark, LayoutGrid, Minus, Plus, ScanSearch, Store, Users, Wallet } from "lucide-react"
import { counter, denoms, difference, diffOf, expected, expectedOf, counted, inr, movements, purchase, rows, totals } from "./data"
import { Diff, Money, Pill, StatusPill, StepBtn } from "./shared"

/* Direction B: FRAMED SHEET. An app shell: tinted frame (sidebar + bottom tabs) around one white working sheet.
   Counting uses a grid of denomination cards: half the scrolling on a phone. */

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm ${active ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-card/60"}`}>
      {icon}
      {label}
    </button>
  )
}

function Shell({ nav, children, tabs }: { nav: React.ReactNode; children: React.ReactNode; tabs: { icon: React.ReactNode; label: string; active?: boolean }[] }) {
  return (
    <div className="flex min-h-[640px] bg-secondary text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 p-3 @3xl:flex">
        <div className="mb-3 flex items-center gap-2 px-1 pt-1">
          <div className="grid size-8 place-items-center rounded-lg bg-foreground text-xs font-bold text-background">SC</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">Smart Cash</p><p className="truncate text-xs text-muted-foreground">Smart Mart</p></div>
        </div>
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col @3xl:p-2 @3xl:pl-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card @3xl:rounded-2xl @3xl:border">{children}</div>
        {/* phone: bottom tabs inside the frame */}
        <nav aria-label="Main" className="grid grid-cols-3 border-t bg-secondary px-2 pb-2 pt-1 @3xl:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
          {tabs.map((t) => (
            <button key={t.label} aria-current={t.active ? "page" : undefined} className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-xs ${t.active ? "bg-card font-semibold text-foreground" : "text-muted-foreground"}`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

const counterNav = (active: "Payments" | "Sales" | "Closing") => (
  <>
    <NavItem icon={<Wallet className="size-4" />} label="Payments" active={active === "Payments"} />
    <NavItem icon={<BarChart3 className="size-4" />} label="Sales" active={active === "Sales"} />
    <NavItem icon={<ClipboardCheck className="size-4" />} label="Closing" active={active === "Closing"} />
  </>
)
const counterTabs = (active: string) => ["Payments", "Sales", "Closing"].map((l, i) => ({ label: l, active: l === active, icon: [<Wallet key="w" className="size-5" />, <BarChart3 key="b" className="size-5" />, <ClipboardCheck key="c" className="size-5" />][i] }))

function TopBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold leading-tight">{title}</h1><p className="truncate text-xs text-muted-foreground">{counter.name} · {counter.date}</p></div>
      <Pill tone="success"><Check className="size-3.5" aria-hidden /> Verified</Pill>
    </div>
  )
}

/** the running totals, collapsed to one tappable line */
function TotalsBar() {
  return (
    <button className="flex w-full items-center gap-3 border-t bg-card px-4 py-3 text-left">
      <span className="flex-1 text-sm"><span className="text-muted-foreground">Expected </span><Money n={expected} className="font-semibold" /><span className="text-muted-foreground"> · Counted </span><Money n={counted} className="font-semibold" /></span>
      <Diff value={difference} />
      <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
    </button>
  )
}

export function CounterB() {
  return (
    <Shell nav={counterNav("Payments")} tabs={counterTabs("Payments")}>
      <TopBar title="Payments" />
      <div className="flex-1 space-y-3 p-4">
        <div className="grid gap-3 @2xl:grid-cols-2">
          <section className="rounded-xl bg-secondary/60 p-4">
            <h2 className="text-sm font-semibold">Money out today</h2>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{inr(day_out())}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {movements.map((m) => (<li key={m.what} className="flex justify-between gap-3"><span>{m.what}</span><span className="tabular-nums">−{inr(m.amount)}</span></li>))}
            </ul>
          </section>
          <section className="space-y-2 rounded-xl bg-secondary/60 p-4">
            <h2 className="text-sm font-semibold">Add a cash movement</h2>
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-1 text-sm"><button className="h-10 rounded-md bg-danger-soft font-medium text-danger">Money out</button><button className="h-10 rounded-md text-muted-foreground">Money in</button></div>
            <input aria-label="What is it for" placeholder="What is it for?" className="h-12 w-full rounded-lg border bg-card px-3 text-base" />
            <input aria-label="Amount" inputMode="decimal" placeholder="₹ 0" className="h-12 w-full rounded-lg border bg-card px-3 text-base tabular-nums" />
            <button className="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background">Add</button>
          </section>
        </div>
        <button className="flex w-full items-center gap-3 rounded-xl border p-4 text-left"><Store className="size-5 text-muted-foreground" aria-hidden /><span className="flex-1"><span className="block text-sm font-semibold">Pay a vendor's bill</span><span className="block text-xs text-muted-foreground">Recorded as money out</span></span></button>
      </div>
      <TotalsBar />
    </Shell>
  )
}
const day_out = () => movements.reduce((s, m) => s + m.amount, 0)

export function ClosingB() {
  const Card = ({ d }: { d: (typeof denoms)[number] }) => (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between"><span className="text-base font-semibold">{d.label}<span className="ml-1 text-xs font-normal text-muted-foreground">{d.kind}</span></span><span className="text-sm tabular-nums text-muted-foreground">{inr(d.value * d.count)}</span></div>
      <div className="mt-2 flex items-center gap-1.5">
        <StepBtn label={`Fewer ${d.label}`}><Minus className="size-4" /></StepBtn>
        <input aria-label={`${d.label} ${d.kind} count`} inputMode="numeric" defaultValue={d.count} className="h-11 min-w-0 flex-1 rounded-lg border bg-card text-center text-lg font-semibold tabular-nums" />
        <StepBtn label={`More ${d.label}`}><Plus className="size-4" /></StepBtn>
      </div>
    </div>
  )
  return (
    <Shell nav={counterNav("Closing")} tabs={counterTabs("Closing")}>
      <TopBar title="Count the drawer" />
      <div className="flex-1 space-y-4 p-4">
        <div><h2 className="mb-2 text-sm font-semibold text-muted-foreground">Notes</h2><div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">{denoms.filter((d) => d.kind === "note").map((d) => <Card key={d.label + d.kind} d={d} />)}</div></div>
        <div><h2 className="mb-2 text-sm font-semibold text-muted-foreground">Coins</h2><div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">{denoms.filter((d) => d.kind === "coin").map((d) => <Card key={d.label + d.kind} d={d} />)}</div></div>
      </div>
      <div className="flex items-center gap-3 border-t bg-card px-4 py-3">
        <div className="flex-1"><p className="text-xs text-muted-foreground">Counted</p><p className="text-xl font-semibold tabular-nums">{inr(counted)}</p></div>
        <Diff value={difference} />
        <button className="h-12 rounded-lg bg-foreground px-5 text-sm font-semibold text-background">Review</button>
      </div>
    </Shell>
  )
}

export function AdminB() {
  return (
    <Shell
      nav={
        <>
          <NavItem icon={<LayoutGrid className="size-4" />} label="Overview" active />
          <NavItem icon={<Store className="size-4" />} label="Counters" />
          <NavItem icon={<Landmark className="size-4" />} label="Purchase" />
          <NavItem icon={<BarChart3 className="size-4" />} label="Reports" />
          <NavItem icon={<ScanSearch className="size-4" />} label="Reconciliation" />
          <NavItem icon={<Users className="size-4" />} label="People" />
        </>
      }
      tabs={[
        { icon: <LayoutGrid className="size-5" />, label: "Overview", active: true },
        { icon: <Store className="size-5" />, label: "Counters" },
        { icon: <Landmark className="size-5" />, label: "Purchase" },
        { icon: <CreditCard className="size-5" />, label: "More" },
      ]}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3"><div className="flex-1"><h1 className="text-lg font-semibold leading-tight">Overview</h1><p className="text-xs text-muted-foreground">Saturday, 31 October 2026 · {totals.submitted} of 4 counters submitted</p></div><input aria-label="Date" defaultValue="31 Oct" className="h-10 w-28 rounded-lg border bg-card px-3 text-sm" /></div>
      <div className="flex-1 space-y-4 p-4">
        <div className="rounded-xl bg-secondary/60 p-4"><p className="text-xs text-muted-foreground">Total sales today</p><p className="text-3xl font-semibold tabular-nums">{inr(totals.sales)}</p><p className="mt-1 text-xs text-muted-foreground"><span className="tabular-nums">{inr(totals.cash)}</span> cash · <span className="tabular-nums">{inr(totals.card)}</span> card/UPI · <span className="tabular-nums">{inr(totals.credit)}</span> credit</p></div>
        <div className="grid gap-3 @2xl:grid-cols-2">
          {rows.map((r) => (
            <article key={r.name} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{r.name}</h2><StatusPill status={r.status} /></div>
              <p className="mt-3 text-xs text-muted-foreground">Expected in drawer</p>
              <p className="text-2xl font-semibold tabular-nums">{inr(expectedOf(r))}</p>
              <div className="mt-2 flex items-center justify-between text-sm"><span className="tabular-nums text-muted-foreground">Counted {r.counted === null ? "—" : inr(r.counted)}</span><Diff value={diffOf(r)} /></div>
              {r.status === "submitted" && <button className="mt-3 h-11 w-full rounded-lg bg-foreground text-sm font-semibold text-background">Confirm this day</button>}
            </article>
          ))}
        </div>
        <article className="rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Purchase counter</h2><Pill tone="warning">{inr(purchase.handover)} to collect</Pill></div><p className="mt-1 text-sm text-muted-foreground">Paid to vendors in cash <span className="tabular-nums">{inr(purchase.paidCash)}</span> · drawer <span className="tabular-nums">{inr(purchase.drawer)}</span></p></article>
      </div>
    </Shell>
  )
}
