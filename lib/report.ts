import type { DayEntry, DenominationCount } from "./types"
import {
  calculateCashSales,
  calculateClosingCash,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "./types"

/* ================= PER-ENTRY NUMBERS ================= */

export interface Metrics {
  opening: number
  sales: number
  cash: number
  card: number
  credit: number
  /** sales split by shop (the "Both" counter reports each shop separately) */
  martSales: number
  fashionSales: number
  moneyIn: number
  moneyOut: number
  expected: number
  actual: number
  /** expected - actual: positive = shortage, negative = excess */
  diff: number
  nextDay: number
  available: number
  /** submitted or confirmed - only then is the cash count final */
  settled: boolean
}

const EMPTY: DenominationCount = {
  notes500: 0,
  notes200: 0,
  notes100: 0,
  notes50: 0,
  notes20: 0,
  notes10: 0,
  coins10: 0,
  coins5: 0,
  coins2: 0,
  coins1: 0,
}

export function entryMetrics(e: DayEntry): Metrics {
  const both = e.counterName === "Smart Fashion (Both)"
  const sales = e.sales
  const cash = calculateCashSales(sales, both)
  const { totalIn, totalOut } = calculatePaymentSummary(e.payments || [])

  const card = both
    ? (sales.martCardUpi || 0) + (sales.fashionCardUpi || 0)
    : sales.cardUpiSales || 0
  const credit = both
    ? (sales.martCredit || 0) + (sales.fashionCredit || 0)
    : sales.creditSales || 0

  const expected = calculateExpectedCashWithInOut(
    e.openingCash || 0,
    cash,
    e.payments || []
  )
  const closing = e.closingDenominations || EMPTY
  const next = e.nextDayOpeningDenominations || EMPTY
  const actual = calculateClosingCash(closing)

  const available = calculateClosingCash({
    notes500: Math.max(0, (closing.notes500 || 0) - (next.notes500 || 0)),
    notes200: Math.max(0, (closing.notes200 || 0) - (next.notes200 || 0)),
    notes100: Math.max(0, (closing.notes100 || 0) - (next.notes100 || 0)),
    notes50: Math.max(0, (closing.notes50 || 0) - (next.notes50 || 0)),
    notes20: Math.max(0, (closing.notes20 || 0) - (next.notes20 || 0)),
    notes10: Math.max(0, (closing.notes10 || 0) - (next.notes10 || 0)),
    coins10: Math.max(0, (closing.coins10 || 0) - (next.coins10 || 0)),
    coins5: Math.max(0, (closing.coins5 || 0) - (next.coins5 || 0)),
    coins2: Math.max(0, (closing.coins2 || 0) - (next.coins2 || 0)),
    coins1: Math.max(0, (closing.coins1 || 0) - (next.coins1 || 0)),
  })

  const total = cash + card + credit
  return {
    opening: e.openingCash || 0,
    sales: total,
    cash,
    card,
    credit,
    martSales: both ? sales.martTotalSales || 0 : total,
    fashionSales: both ? sales.fashionTotalSales || 0 : 0,
    moneyIn: totalIn,
    moneyOut: totalOut,
    expected,
    actual,
    diff: expected - actual,
    nextDay: calculateClosingCash(next),
    available,
    settled: e.status !== "open",
  }
}

export interface Totals {
  opening: number
  sales: number
  cash: number
  card: number
  credit: number
  martSales: number
  fashionSales: number
  moneyIn: number
  moneyOut: number
  expected: number
  actual: number
  /** only counts days whose cash is final (submitted / confirmed) */
  diff: number
  nextDay: number
  available: number
  days: number
  settledDays: number
}

export function emptyTotals(): Totals {
  return {
    opening: 0,
    sales: 0,
    cash: 0,
    card: 0,
    credit: 0,
    martSales: 0,
    fashionSales: 0,
    moneyIn: 0,
    moneyOut: 0,
    expected: 0,
    actual: 0,
    diff: 0,
    nextDay: 0,
    available: 0,
    days: 0,
    settledDays: 0,
  }
}

export function addMetrics(t: Totals, m: Metrics): Totals {
  t.opening += m.opening
  t.sales += m.sales
  t.cash += m.cash
  t.card += m.card
  t.credit += m.credit
  t.martSales += m.martSales
  t.fashionSales += m.fashionSales
  t.moneyIn += m.moneyIn
  t.moneyOut += m.moneyOut
  t.expected += m.expected
  t.actual += m.actual
  t.nextDay += m.nextDay
  t.available += m.available
  t.days += 1
  if (m.settled) {
    t.diff += m.diff
    t.settledDays += 1
  }
  return t
}

/** One entry per counter per date, preferring the furthest-along status. */
export function dedupeEntries(entries: DayEntry[]): DayEntry[] {
  const rank = (x: DayEntry) =>
    x.status === "confirmed" ? 3 : x.status === "submitted" ? 2 : 1
  const map = new Map<string, DayEntry>()
  for (const e of entries) {
    const key = `${e.counterName}_${e.date}`
    const cur = map.get(key)
    if (!cur || rank(e) > rank(cur)) map.set(key, e)
  }
  return Array.from(map.values())
}

/* ================= DATES (plain YYYY-MM-DD strings) ================= */

const toUTC = (iso: string) => new Date(iso + "T00:00:00Z")
const toISO = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

/** Monday of the week containing the date. */
export function weekStart(iso: string): string {
  const day = toUTC(iso).getUTCDay() // 0 = Sunday
  return addDays(iso, -((day + 6) % 7))
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number)
  const start = `${month}-01`
  const end = toISO(new Date(Date.UTC(y, m, 0)))
  return { start, end }
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

/* ================= FORMATTING ================= */

export const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const inrCompact = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)

export const shortDate = (iso: string) =>
  toUTC(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

export const weekdayShort = (iso: string) =>
  toUTC(iso).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })
