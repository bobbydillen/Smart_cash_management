/**
 * Sample data for the design previews only (temporary, removed once a direction is chosen).
 * Every total is computed from the rows, so the previews add up like the real screens do.
 */

export const inr = (n: number, decimals = 0) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + inr(Math.abs(n))

/* ---------------- one counter's day ---------------- */

export const counter = { name: "Smart Mart Counter 1", date: "Saturday, 31 October 2026", verifiedBy: "Sugin" }

export const movements = [
  { what: "Tea & snacks for staff", amount: 150, type: "OUT" as const, time: "10:42" },
  { what: "Courier / parcel charges", amount: 600, type: "OUT" as const, time: "13:05" },
  { what: "Auto & transport", amount: 500, type: "OUT" as const, time: "16:20" },
]

export const day = {
  opening: 9120,
  cashSales: 55100,
  cardUpi: 41200,
  credit: 2100,
  moneyIn: 0,
  moneyOut: movements.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0),
}
export const expected = day.opening + day.cashSales + day.moneyIn - day.moneyOut // 62,970

export const denoms = [
  { label: "₹500", value: 500, count: 98, kind: "note" },
  { label: "₹200", value: 200, count: 20, kind: "note" },
  { label: "₹100", value: 100, count: 60, kind: "note" },
  { label: "₹50", value: 50, count: 30, kind: "note" },
  { label: "₹20", value: 20, count: 50, kind: "note" },
  { label: "₹10", value: 10, count: 60, kind: "note" },
  { label: "₹10", value: 10, count: 40, kind: "coin" },
  { label: "₹5", value: 5, count: 50, kind: "coin" },
  { label: "₹2", value: 2, count: 60, kind: "coin" },
  { label: "₹1", value: 1, count: 95, kind: "coin" },
]
export const counted = denoms.reduce((s, d) => s + d.value * d.count, 0) // 62,965
export const difference = expected - counted // +5 = short

if (counted !== 62965 || expected !== 62970) throw new Error("preview data does not add up")

/* ---------------- the admin's day ---------------- */

export type Status = "open" | "submitted" | "confirmed"
export interface Row {
  name: string
  status: Status
  total: number
  cash: number
  card: number
  credit: number
  opening: number
  out: number
  counted: number | null
}

export const rows: Row[] = [
  { name: "Smart Mart Counter 1", status: "submitted", total: 98400, cash: 55100, card: 41200, credit: 2100, opening: 9120, out: 1250, counted: 62965 },
  { name: "Smart Mart Counter 2", status: "submitted", total: 76950, cash: 41500, card: 33600, credit: 1850, opening: 8200, out: 900, counted: 48820 },
  { name: "Smart Mart Fancy", status: "open", total: 18010, cash: 13850, card: 3800, credit: 360, opening: 5100, out: 0, counted: null },
  { name: "Smart Fashion (Both)", status: "confirmed", total: 121850, cash: 66350, card: 52400, credit: 3100, opening: 10600, out: 700, counted: 76250 },
]

export const expectedOf = (r: Row) => r.opening + r.cash - r.out
/** expected − counted: positive is a shortage, negative an excess, null while the day is open */
export const diffOf = (r: Row) => (r.counted === null ? null : expectedOf(r) - r.counted)

export const totals = {
  sales: rows.reduce((s, r) => s + r.total, 0),
  cash: rows.reduce((s, r) => s + r.cash, 0),
  card: rows.reduce((s, r) => s + r.card, 0),
  credit: rows.reduce((s, r) => s + r.credit, 0),
  netDiff: rows.reduce((s, r) => s + (diffOf(r) ?? 0), 0), // submitted/confirmed only
  submitted: rows.filter((r) => r.status !== "open").length,
}
if (totals.sales !== totals.cash + totals.card + totals.credit) throw new Error("sales split does not add up")

export const purchase = { paidCash: 20200, drawer: 75090, kept: 5090, handover: 70000, status: "submitted" as Status }
