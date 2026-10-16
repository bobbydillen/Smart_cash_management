import type { SalesData } from "./types"

/**
 * Server-side input checks. The browser UI already limits what can be typed,
 * but every server action must re-check, since actions can be called directly.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const isDateString = (v: unknown): v is string =>
  typeof v === "string" &&
  DATE_RE.test(v) &&
  !Number.isNaN(Date.parse(v + "T00:00:00Z"))

/** A money amount: finite, within [min, max], rounded to 2 decimals. Null if invalid. */
export function parseMoney(
  v: unknown,
  { min = 0, max = 100_000_000 }: { min?: number; max?: number } = {}
): number | null {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return Math.round(n * 100) / 100
}

/** Trimmed text of 1..max characters. Null if empty or too long. */
export function parseText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().replace(/\s+/g, " ")
  return t.length >= 1 && t.length <= max ? t : null
}

const SALES_KEYS = [
  "totalSales",
  "cardUpiSales",
  "creditSales",
  "martTotalSales",
  "martCardUpi",
  "martCredit",
  "fashionTotalSales",
  "fashionCardUpi",
  "fashionCredit",
] as const

/**
 * Whitelists and checks a sales object.
 * Every figure must be a non-negative amount, and card/UPI plus credit can
 * never exceed the total (cash sales would be negative).
 */
export function cleanSales(
  input: unknown,
  isFashionBoth: boolean
): { sales: SalesData } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Invalid sales data" }
  const src = input as Record<string, unknown>

  const out: Record<string, number> = {}
  for (const k of SALES_KEYS) {
    if (src[k] === undefined || src[k] === "") continue
    const n = parseMoney(src[k])
    if (n === null) return { error: "Sales figures must be valid, non-negative amounts" }
    out[k] = n
  }

  const checks: Array<[string, string, string, string]> = isFashionBoth
    ? [
        ["martTotalSales", "martCardUpi", "martCredit", "Smart Mart"],
        ["fashionTotalSales", "fashionCardUpi", "fashionCredit", "Smart Fashion"],
      ]
    : [["totalSales", "cardUpiSales", "creditSales", "Sales"]]

  for (const [total, card, credit, label] of checks) {
    if ((out[card] || 0) + (out[credit] || 0) > (out[total] || 0) + 0.005) {
      return { error: `${label}: card / UPI plus credit cannot be more than total sales` }
    }
  }

  const base = { totalSales: 0, cardUpiSales: 0, creditSales: 0 }
  return { sales: { ...base, ...out } as SalesData }
}

/** Account passwords. bcrypt only reads the first 72 bytes, so longer ones are refused. */
export const MIN_PASSWORD_LENGTH = 6
export const MAX_PASSWORD_LENGTH = 72
