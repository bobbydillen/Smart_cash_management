"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react"
import type { DayEntry } from "@/lib/types"
import { getEntriesInRange } from "@/app/actions/admin"
import {
  addDays,
  addMetrics,
  addMonths,
  dedupeEntries,
  eachDay,
  emptyTotals,
  entryMetrics,
  inr,
  inrCompact,
  monthBounds,
  shortDate,
  todayIST,
  weekdayShort,
  weekStart,
  type Metrics,
  type Totals,
} from "@/lib/report"

type Mode = "daily" | "weekly" | "monthly"

const shortName = (n: string) => n.replace(/^Smart /, "")

/* ================= STYLE TOKENS ================= */
/* Categorical slots 1-3 of the validated palette (blue / orange / aqua);
   shortage / excess use the reserved status hues and always carry a label. */
const TOKENS = `
.viz-root {
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a;
  --short: #e34948; --excess: #008300;
}
.dark .viz-root {
  --s1: #3987e5; --s2: #d95926; --s3: #199e70;
  --short: #e66767; --excess: #3aa23a;
}
@media print { @page { size: A4 landscape; margin: 8mm; } }
`

const SERIES = [
  { key: "cash", label: "Cash", color: "var(--s1)" },
  { key: "card", label: "Card / UPI", color: "var(--s2)" },
  { key: "credit", label: "Credit", color: "var(--s3)" },
] as const

/* ================= SMALL PIECES ================= */

function Legend ( { items }: { items: { label: string; color: string }[] } )
{
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      { items.map( i => (
        <span key={ i.label } className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={ { background: i.color } }
          />
          { i.label }
        </span>
      ) ) }
    </div>
  )
}

function ChartTooltip ( { active, payload, label }: any )
{
  if ( !active || !payload?.length ) return null
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold">{ label }</div>
      { payload.map( ( p: any ) => (
        <div key={ p.dataKey } className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={ { background: p.color || p.fill } }
            />
            { p.name }
          </span>
          <span className="font-medium tabular-nums">₹{ inr( p.value ) }</span>
        </div>
      ) ) }
    </div>
  )
}

const axisProps = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
} as const

function SalesStack ( {
  data,
  title,
  note,
}: {
  data: { label: string; cash: number; card: number; credit: number }[]
  title: string
  note?: string
} )
{
  const empty = data.every( d => d.cash + d.card + d.credit === 0 )
  return (
    <Card className="p-5 break-inside-avoid">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{ title }</h3>
        <Legend items={ SERIES.map( s => ( { label: s.label, color: s.color } ) ) } />
      </div>
      { note && <p className="mb-2 text-xs text-muted-foreground">{ note }</p> }
      { empty ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No sales recorded for this period.
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ data } margin={ { top: 8, right: 8, left: 0, bottom: 0 } }>
              <CartesianGrid stroke="var(--border)" vertical={ false } />
              <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" />
              <YAxis
                { ...axisProps }
                axisLine={ false }
                width={ 52 }
                tickFormatter={ v => `₹${ inrCompact( v ) }` }
              />
              <Tooltip
                content={ <ChartTooltip /> }
                cursor={ { fill: "var(--muted)", opacity: 0.5 } }
              />
              { SERIES.map( ( s, i ) => (
                <Bar
                  key={ s.key }
                  dataKey={ s.key }
                  name={ s.label }
                  stackId="sales"
                  fill={ s.color }
                  stroke="var(--card)"
                  strokeWidth={ 2 }
                  maxBarSize={ 40 }
                  radius={ i === SERIES.length - 1 ? [ 4, 4, 0, 0 ] : 0 }
                  isAnimationActive={ false }
                />
              ) ) }
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) }
    </Card>
  )
}

function DiffChart ( { data }: { data: { label: string; value: number | null }[] } )
{
  const has = data.some( d => d.value !== null && d.value !== 0 )
  return (
    <Card className="p-5 break-inside-avoid">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Shortage / excess by day</h3>
        <Legend
          items={ [
            { label: "Shortage", color: "var(--short)" },
            { label: "Excess", color: "var(--excess)" },
          ] }
        />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Only days that were submitted are counted. Above the line is a shortage.
      </p>
      { !has ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No shortage or excess in this period.
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ data } margin={ { top: 8, right: 8, left: 0, bottom: 0 } }>
              <CartesianGrid stroke="var(--border)" vertical={ false } />
              <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" />
              <YAxis
                { ...axisProps }
                axisLine={ false }
                width={ 52 }
                tickFormatter={ v => `₹${ inrCompact( v ) }` }
              />
              <Tooltip
                cursor={ { fill: "var(--muted)", opacity: 0.5 } }
                content={ ( { active, payload, label }: any ) =>
                {
                  if ( !active || !payload?.length ) return null
                  const v = payload[ 0 ].value as number | null
                  return (
                    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
                      <div className="font-semibold">{ label }</div>
                      <div className="tabular-nums">
                        { v === null || v === 0
                          ? "Balanced"
                          : v > 0
                            ? `Shortage ₹${ inr( v ) }`
                            : `Excess ₹${ inr( Math.abs( v ) ) }` }
                      </div>
                    </div>
                  )
                } }
              />
              <Bar
                dataKey="value"
                name="Shortage / excess"
                maxBarSize={ 28 }
                radius={ 4 }
                isAnimationActive={ false }
              >
                { data.map( ( d, i ) => (
                  <Cell
                    key={ i }
                    fill={ ( d.value ?? 0 ) > 0 ? "var(--short)" : "var(--excess)" }
                  />
                ) ) }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) }
    </Card>
  )
}

function Kpi ( {
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "short" | "excess"
} )
{
  return (
    <Card className="p-4 break-inside-avoid">
      <div className="text-xs text-muted-foreground">{ label }</div>
      <div
        className={ `mt-1 text-xl font-bold tabular-nums ${ tone === "short"
          ? "text-red-600"
          : tone === "excess"
            ? "text-green-700"
            : ""
          }` }
      >
        { value }
      </div>
      { sub && <div className="mt-0.5 text-xs text-muted-foreground">{ sub }</div> }
    </Card>
  )
}

/** Shortage / excess as words, never colour alone. Not final for open days. */
function DiffCell ( { diff, settled }: { diff: number; settled: boolean } )
{
  if ( !settled ) return <span className="text-muted-foreground">—</span>
  if ( Math.abs( diff ) < 0.005 )
    return <span className="text-muted-foreground">Balanced</span>
  return diff > 0 ? (
    <span className="font-semibold text-red-600">▲ Short { inr( diff ) }</span>
  ) : (
    <span className="font-semibold text-green-700">▼ Excess { inr( -diff ) }</span>
  )
}

const StatusPill = ( { status }: { status: string } ) => (
  <span
    className={ `rounded-full px-2 py-0.5 text-[10px] font-semibold ${ status === "confirmed"
      ? "bg-green-100 text-green-800"
      : status === "submitted"
        ? "bg-orange-100 text-orange-800"
        : "bg-blue-100 text-blue-800"
      }` }
  >
    { status.toUpperCase() }
  </span>
)

const th = "px-2 py-2 text-right font-semibold whitespace-nowrap"
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap"

/* ================= MAIN ================= */

export default function ComparisonReport ( { backHref }: { backHref: string } )
{
  const router = useRouter()
  const today = todayIST()

  const [ mode, setMode ] = useState<Mode>( "daily" )
  const [ date, setDate ] = useState( today )
  const [ month, setMonth ] = useState( today.slice( 0, 7 ) )

  const [ entries, setEntries ] = useState<DayEntry[]>( [] )
  const [ loading, setLoading ] = useState( true )

  /* ---------- period ---------- */
  const range = useMemo( () =>
  {
    if ( mode === "daily" ) return { start: date, end: date }
    if ( mode === "weekly" )
    {
      const start = weekStart( date )
      return { start, end: addDays( start, 6 ) }
    }
    return monthBounds( month )
  }, [ mode, date, month ] )

  const periodLabel =
    mode === "daily"
      ? new Date( date + "T00:00:00Z" ).toLocaleDateString( "en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      } )
      : mode === "weekly"
        ? `${ shortDate( range.start ) } – ${ shortDate( range.end ) } ${ range.end.slice( 0, 4 ) }`
        : new Date( range.start + "T00:00:00Z" ).toLocaleDateString( "en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        } )

  const step = ( dir: -1 | 1 ) =>
  {
    if ( mode === "daily" ) setDate( d => addDays( d, dir ) )
    else if ( mode === "weekly" ) setDate( d => addDays( d, 7 * dir ) )
    else setMonth( m => addMonths( m, dir ) )
  }
  const atPresent = range.end >= today

  /* ---------- data ---------- */
  useEffect( () =>
  {
    let stale = false
    setLoading( true )
    getEntriesInRange( range.start, range.end ).then( res =>
    {
      if ( stale ) return
      setEntries( res )
      setLoading( false )
    } )
    return () =>
    {
      stale = true
    }
  }, [ range.start, range.end ] )

  /* ---------- numbers ---------- */
  const { rows, totals, byCounter, byDay, counterOrder } = useMemo( () =>
  {
    const rows = dedupeEntries( entries )
      .map( e => ( { e, m: entryMetrics( e ) } ) )
      .sort( ( a, b ) => a.e.counterName.localeCompare( b.e.counterName ) )

    const totals = emptyTotals()
    const byCounter = new Map<string, Totals>()
    const byDay = new Map<string, Totals>()

    for ( const { e, m } of rows )
    {
      addMetrics( totals, m )
      if ( !byCounter.has( e.counterName ) ) byCounter.set( e.counterName, emptyTotals() )
      addMetrics( byCounter.get( e.counterName )!, m )
      if ( !byDay.has( e.date ) ) byDay.set( e.date, emptyTotals() )
      addMetrics( byDay.get( e.date )!, m )
    }

    return {
      rows,
      totals,
      byCounter,
      byDay,
      counterOrder: Array.from( byCounter.keys() ).sort(),
    }
  }, [ entries ] )

  const days = useMemo( () => eachDay( range.start, range.end ), [ range ] )

  const counterChart = counterOrder.map( c =>
  {
    const t = byCounter.get( c )!
    return { label: shortName( c ), cash: t.cash, card: t.card, credit: t.credit }
  } )

  const dayChart = days.map( d =>
  {
    const t = byDay.get( d )
    return {
      label: mode === "weekly" ? `${ weekdayShort( d ) } ${ d.slice( 8 ) }` : String( Number( d.slice( 8 ) ) ),
      cash: t?.cash ?? 0,
      card: t?.card ?? 0,
      credit: t?.credit ?? 0,
    }
  } )

  const diffChart = days.map( ( d, i ) =>
  {
    const t = byDay.get( d )
    return {
      label: dayChart[ i ].label,
      value: t && t.settledDays > 0 ? t.diff : null,
    }
  } )

  const bestDay = [ ...byDay.entries() ].sort( ( a, b ) => b[ 1 ].sales - a[ 1 ].sales )[ 0 ]
  const bestCounter = [ ...byCounter.entries() ].sort( ( a, b ) => b[ 1 ].sales - a[ 1 ].sales )[ 0 ]

  const diffTone =
    totals.settledDays === 0 || Math.abs( totals.diff ) < 0.005
      ? undefined
      : totals.diff > 0
        ? "short"
        : "excess"
  const diffText =
    totals.settledDays === 0
      ? "—"
      : Math.abs( totals.diff ) < 0.005
        ? "Balanced"
        : totals.diff > 0
          ? `Short ₹${ inr( totals.diff ) }`
          : `Excess ₹${ inr( -totals.diff ) }`

  /* ================= RENDER ================= */
  return (
    <div className="viz-root min-h-screen bg-muted/40 p-4 sm:p-6 print:bg-white print:p-0">
      <style>{ TOKENS }</style>

      <div className="mx-auto max-w-7xl space-y-5">
        {/* ---------- HEADER ---------- */ }
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Counter Reports</h1>
            <p className="text-sm text-muted-foreground">
              Compare counters by day, week or month
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={ () => window.print() }>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={ () => router.push( backHref ) }>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>

        <div className="hidden print:block">
          <h1 className="text-xl font-bold">
            Counter Report — { mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Monthly" }
          </h1>
          <p className="text-sm">{ periodLabel }</p>
        </div>

        {/* ---------- CONTROLS ---------- */ }
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 print:hidden">
          <div className="inline-flex rounded-md border p-0.5">
            { ( [ "daily", "weekly", "monthly" ] as Mode[] ).map( m => (
              <button
                key={ m }
                onClick={ () => setMode( m ) }
                className={ `rounded px-4 py-1.5 text-sm font-medium capitalize transition-colors ${ mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
                  }` }
              >
                { m }
              </button>
            ) ) }
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={ () => step( -1 ) } aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-56 text-center text-sm font-semibold">{ periodLabel }</div>
            <Button
              variant="outline"
              size="icon"
              onClick={ () => step( 1 ) }
              disabled={ atPresent }
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            { mode === "monthly" ? (
              <Input
                type="month"
                value={ month }
                max={ today.slice( 0, 7 ) }
                onChange={ e => e.target.value && setMonth( e.target.value ) }
                className="w-44"
              />
            ) : (
              <Input
                type="date"
                value={ date }
                max={ today }
                onChange={ e => e.target.value && setDate( e.target.value ) }
                className="w-44"
              />
            ) }
            <Button
              variant="ghost"
              size="sm"
              onClick={ () =>
              {
                setDate( today )
                setMonth( today.slice( 0, 7 ) )
              } }
            >
              { mode === "daily" ? "Today" : mode === "weekly" ? "This week" : "This month" }
            </Button>
          </div>
        </Card>

        { loading ? (
          <Card className="p-16 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : rows.length === 0 ? (
          <Card className="p-16 text-center text-sm text-muted-foreground">
            No counter activity was recorded for this period.
          </Card>
        ) : (
          <>
            {/* ---------- KPIs ---------- */ }
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Total sales" value={ `₹${ inr( totals.sales ) }` } />
              <Kpi label="Cash sales" value={ `₹${ inr( totals.cash ) }` } />
              <Kpi label="Card / UPI" value={ `₹${ inr( totals.card ) }` } />
              <Kpi label="Credit" value={ `₹${ inr( totals.credit ) }` } />
              <Kpi
                label="Payments out"
                value={ `₹${ inr( totals.moneyOut ) }` }
                sub={ `In ₹${ inr( totals.moneyIn ) }` }
              />
              <Kpi
                label="Net shortage / excess"
                value={ diffText }
                tone={ diffTone }
                sub={ `${ totals.settledDays } of ${ totals.days } counter-days submitted` }
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Smart Mart sales" value={ `₹${ inr( totals.martSales ) }` } sub="Counters 1, 2, Fancy + Mart side of Both" />
              <Kpi label="Smart Fashion sales" value={ `₹${ inr( totals.fashionSales ) }` } sub="Fashion side of the Both counter" />
              { mode !== "daily" && bestDay && (
                <Kpi
                  label="Best day"
                  value={ `${ weekdayShort( bestDay[ 0 ] ) } ${ shortDate( bestDay[ 0 ] ) }` }
                  sub={ `₹${ inr( bestDay[ 1 ].sales ) }` }
                />
              ) }
              { bestCounter && (
                <Kpi
                  label="Top counter"
                  value={ shortName( bestCounter[ 0 ] ) }
                  sub={ `₹${ inr( bestCounter[ 1 ].sales ) }` }
                />
              ) }
            </div>

            {/* ---------- CHARTS ---------- */ }
            { mode === "daily" ? (
              <SalesStack title="Sales by counter" data={ counterChart } />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SalesStack
                  title={ mode === "weekly" ? "Sales by day" : "Sales by day of month" }
                  data={ dayChart }
                />
                <SalesStack title="Sales by counter" data={ counterChart } />
                <div className="lg:col-span-2">
                  <DiffChart data={ diffChart } />
                </div>
              </div>
            ) }

            {/* ---------- DAILY TABLE ---------- */ }
            { mode === "daily" && (
              <Card className="p-4 print:border-none print:p-0 print:shadow-none">
                <h3 className="mb-3 font-semibold">Counter details</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-2 py-2 text-left font-semibold">Counter</th>
                        <th className={ th }>Opening</th>
                        <th className={ th }>Sales</th>
                        <th className={ th }>Cash</th>
                        <th className={ th }>Card</th>
                        <th className={ th }>Credit</th>
                        <th className={ th }>In</th>
                        <th className={ th }>Out</th>
                        <th className={ th }>Expected</th>
                        <th className={ th }>Counted</th>
                        <th className={ th }>Short / Excess</th>
                        <th className={ th }>Next day</th>
                        <th className={ th }>Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      { rows.map( ( { e, m } ) => (
                        <DailyRow key={ e._id } e={ e } m={ m } />
                      ) ) }
                      <tr className="border-t-2 bg-muted/50 font-bold">
                        <td className="px-2 py-2 text-left">Grand total</td>
                        <td className={ td }>{ inr( totals.opening ) }</td>
                        <td className={ td }>{ inr( totals.sales ) }</td>
                        <td className={ td }>{ inr( totals.cash ) }</td>
                        <td className={ td }>{ inr( totals.card ) }</td>
                        <td className={ td }>{ inr( totals.credit ) }</td>
                        <td className={ td }>{ inr( totals.moneyIn ) }</td>
                        <td className={ td }>{ inr( totals.moneyOut ) }</td>
                        <td className={ td }>{ inr( totals.expected ) }</td>
                        <td className={ td }>{ inr( totals.actual ) }</td>
                        <td className={ td }>
                          <DiffCell diff={ totals.diff } settled={ totals.settledDays > 0 } />
                        </td>
                        <td className={ td }>{ inr( totals.nextDay ) }</td>
                        <td className={ td }>{ inr( totals.available ) }</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Short / excess is shown once a counter has submitted its day.
                </p>
              </Card>
            ) }

            {/* ---------- WEEKLY / MONTHLY TABLES ---------- */ }
            { mode !== "daily" && (
              <>
                <Card className="p-4 print:border-none print:p-0 print:shadow-none">
                  <h3 className="mb-3 font-semibold">By counter</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-2 py-2 text-left font-semibold">Counter</th>
                          <th className={ th }>Days</th>
                          <th className={ th }>Sales</th>
                          <th className={ th }>Cash</th>
                          <th className={ th }>Card</th>
                          <th className={ th }>Credit</th>
                          <th className={ th }>Out</th>
                          <th className={ th }>Avg / day</th>
                          <th className={ th }>Short / Excess</th>
                        </tr>
                      </thead>
                      <tbody>
                        { counterOrder.map( c =>
                        {
                          const t = byCounter.get( c )!
                          return (
                            <tr key={ c } className="border-b">
                              <td className="px-2 py-1.5 text-left font-medium">{ c }</td>
                              <td className={ td }>{ t.days }</td>
                              <td className={ td }>{ inr( t.sales ) }</td>
                              <td className={ td }>{ inr( t.cash ) }</td>
                              <td className={ td }>{ inr( t.card ) }</td>
                              <td className={ td }>{ inr( t.credit ) }</td>
                              <td className={ td }>{ inr( t.moneyOut ) }</td>
                              <td className={ td }>{ inr( t.days ? t.sales / t.days : 0 ) }</td>
                              <td className={ td }>
                                <DiffCell diff={ t.diff } settled={ t.settledDays > 0 } />
                              </td>
                            </tr>
                          )
                        } ) }
                        <tr className="border-t-2 bg-muted/50 font-bold">
                          <td className="px-2 py-2 text-left">Total</td>
                          <td className={ td }>{ totals.days }</td>
                          <td className={ td }>{ inr( totals.sales ) }</td>
                          <td className={ td }>{ inr( totals.cash ) }</td>
                          <td className={ td }>{ inr( totals.card ) }</td>
                          <td className={ td }>{ inr( totals.credit ) }</td>
                          <td className={ td }>{ inr( totals.moneyOut ) }</td>
                          <td className={ td }>{ inr( totals.days ? totals.sales / totals.days : 0 ) }</td>
                          <td className={ td }>
                            <DiffCell diff={ totals.diff } settled={ totals.settledDays > 0 } />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-4 print:border-none print:p-0 print:shadow-none">
                  <h3 className="mb-3 font-semibold">By day</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-2 py-2 text-left font-semibold">Date</th>
                          <th className={ th }>Sales</th>
                          <th className={ th }>Cash</th>
                          <th className={ th }>Card</th>
                          <th className={ th }>Credit</th>
                          <th className={ th }>Out</th>
                          <th className={ th }>Submitted</th>
                          <th className={ th }>Short / Excess</th>
                        </tr>
                      </thead>
                      <tbody>
                        { days.map( d =>
                        {
                          const t = byDay.get( d )
                          return (
                            <tr key={ d } className="border-b">
                              <td className="px-2 py-1.5 text-left font-medium">
                                { weekdayShort( d ) } { shortDate( d ) }
                              </td>
                              { t ? (
                                <>
                                  <td className={ td }>{ inr( t.sales ) }</td>
                                  <td className={ td }>{ inr( t.cash ) }</td>
                                  <td className={ td }>{ inr( t.card ) }</td>
                                  <td className={ td }>{ inr( t.credit ) }</td>
                                  <td className={ td }>{ inr( t.moneyOut ) }</td>
                                  <td className={ td }>
                                    { t.settledDays }/{ t.days }
                                  </td>
                                  <td className={ td }>
                                    <DiffCell diff={ t.diff } settled={ t.settledDays > 0 } />
                                  </td>
                                </>
                              ) : (
                                <td colSpan={ 7 } className="px-2 py-1.5 text-right text-muted-foreground">
                                  No entries
                                </td>
                              ) }
                            </tr>
                          )
                        } ) }
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) }
          </>
        ) }
      </div>
    </div>
  )
}

/* ================= DAILY ROW (with Smart Fashion split) ================= */

function DailyRow ( { e, m }: { e: DayEntry; m: Metrics } )
{
  const both = e.counterName === "Smart Fashion (Both)"
  const s = e.sales

  const split = ( label: string, total: number, card: number, credit: number ) => (
    <tr className="border-b text-muted-foreground">
      <td className="py-1 pl-6 pr-2 text-left">└ { label }</td>
      <td className={ td }>—</td>
      <td className={ td }>{ inr( total ) }</td>
      <td className={ td }>{ inr( total - card - credit ) }</td>
      <td className={ td }>{ inr( card ) }</td>
      <td className={ td }>{ inr( credit ) }</td>
      <td colSpan={ 7 } />
    </tr>
  )

  return (
    <>
      <tr className="border-b">
        <td className="px-2 py-1.5 text-left">
          <div className="font-semibold">{ e.counterName }</div>
          <StatusPill status={ e.status } />
        </td>
        <td className={ td }>{ inr( m.opening ) }</td>
        <td className={ td }>{ inr( m.sales ) }</td>
        <td className={ td }>{ inr( m.cash ) }</td>
        <td className={ td }>{ inr( m.card ) }</td>
        <td className={ td }>{ inr( m.credit ) }</td>
        <td className={ td }>{ inr( m.moneyIn ) }</td>
        <td className={ td }>{ inr( m.moneyOut ) }</td>
        <td className={ td }>{ inr( m.expected ) }</td>
        <td className={ td }>{ inr( m.actual ) }</td>
        <td className={ td }>
          <DiffCell diff={ m.diff } settled={ m.settled } />
        </td>
        <td className={ td }>{ inr( m.nextDay ) }</td>
        <td className={ td }>{ inr( m.available ) }</td>
      </tr>
      { both && (
        <>
          { split( "Smart Mart", s.martTotalSales || 0, s.martCardUpi || 0, s.martCredit || 0 ) }
          { split( "Smart Fashion", s.fashionTotalSales || 0, s.fashionCardUpi || 0, s.fashionCredit || 0 ) }
        </>
      ) }
    </>
  )
}
