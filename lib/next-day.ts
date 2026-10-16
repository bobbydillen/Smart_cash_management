import type { DenominationCount } from "./types"
import { calculateClosingCash } from "./types"

/**
 * Next-day opening cash = coins (all of them by default, editable)
 *                       + the notes the counter chose to keep.
 */

export const NOTE_KEYS = [
  "notes500",
  "notes200",
  "notes100",
  "notes50",
  "notes20",
  "notes10",
] as const

export const COIN_KEYS = ["coins10", "coins5", "coins2", "coins1"] as const

export type NoteKey = (typeof NOTE_KEYS)[number]
export type CoinKey = (typeof COIN_KEYS)[number]

export const NOTE_VALUE: Record<NoteKey, number> = {
  notes500: 500,
  notes200: 200,
  notes100: 100,
  notes50: 50,
  notes20: 20,
  notes10: 10,
}

/** Every note and coin, largest first: [label, key, value]. */
export const DENOMS = [
  ["₹500", "notes500", 500],
  ["₹200", "notes200", 200],
  ["₹100", "notes100", 100],
  ["₹50", "notes50", 50],
  ["₹20", "notes20", 20],
  ["₹10", "notes10", 10],
  ["₹10", "coins10", 10],
  ["₹5", "coins5", 5],
  ["₹2", "coins2", 2],
  ["₹1", "coins1", 1],
] as const

export const emptyDenoms = (): DenominationCount => ({
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
})

const int = (n: unknown) => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** closing minus next-day opening, per denomination (never below zero) */
export function subtractDenoms(
  closing: Partial<DenominationCount>,
  next?: Partial<DenominationCount> | null
): DenominationCount {
  const out = emptyDenoms()
  for (const k of Object.keys(out) as (keyof DenominationCount)[]) {
    out[k] = Math.max(0, int(closing[k]) - int(next?.[k]))
  }
  return out
}

export function notesTotal(d: Partial<DenominationCount>): number {
  return NOTE_KEYS.reduce((s, k) => s + int(d[k]) * NOTE_VALUE[k], 0)
}

export function coinsTotal(d: Partial<DenominationCount>): number {
  return (
    int(d.coins10) * 10 + int(d.coins5) * 5 + int(d.coins2) * 2 + int(d.coins1)
  )
}

/**
 * The next-day denominations implied by the closing count and the chosen counts.
 * Nothing can exceed what was counted at closing.
 * `followCoins` (the default) carries every coin; set it to false to use the
 * coin counts the counter chose by hand.
 */
export function deriveNextDay(
  closing: Partial<DenominationCount>,
  chosen?: Partial<DenominationCount> | null,
  opts: { followCoins?: boolean } = {}
): DenominationCount {
  const followCoins = opts.followCoins ?? true
  const out = emptyDenoms()
  for (const k of COIN_KEYS) {
    out[k] = followCoins ? int(closing[k]) : Math.min(int(chosen?.[k]), int(closing[k]))
  }
  for (const k of NOTE_KEYS) {
    out[k] = Math.min(int(chosen?.[k]), int(closing[k]))
  }
  return out
}

export interface Allocation {
  notes: Record<NoteKey, number>
  /** total of the allocated notes */
  total: number
  /** target rounded up to the smallest note unit (₹10) */
  target: number
  /** false when the counter does not hold enough notes to reach the target */
  reachable: boolean
}

/**
 * Smallest total >= `want` (in ₹10 units) that can be made from the given
 * denominations without exceeding the counts. Among combinations with that
 * total, the one using the lowest denominations first is returned.
 */
function solveMinimum(unit: number[], count: number[], want: number): number[] | null {
  const n = unit.length
  const max = count.reduce((s, c, i) => s + c * unit[i], 0)
  if (want > max) return null

  const attempt = (cap: number): number[] | null => {
    // reach[i][s]: can sum s be made using only denominations i..n-1
    const reach: Uint8Array[] = new Array(n + 1)
    reach[n] = new Uint8Array(cap + 1)
    reach[n][0] = 1
    for (let i = n - 1; i >= 0; i--) {
      const cur = Uint8Array.from(reach[i + 1])
      const used = new Uint32Array(cap + 1)
      for (let s = unit[i]; s <= cap; s++) {
        if (!cur[s] && cur[s - unit[i]] && used[s - unit[i]] < count[i]) {
          cur[s] = 1
          used[s] = used[s - unit[i]] + 1
        }
      }
      reach[i] = cur
    }

    let best = -1
    for (let s = want; s <= cap; s++) {
      if (reach[0][s]) {
        best = s
        break
      }
    }
    if (best < 0) return null

    const take = new Array(n).fill(0)
    let rem = best
    for (let i = 0; i < n; i++) {
      for (let c = Math.min(count[i], Math.floor(rem / unit[i])); c >= 0; c--) {
        if (reach[i + 1][rem - c * unit[i]]) {
          take[i] = c
          rem -= c * unit[i]
          break
        }
      }
    }
    return take
  }

  // a small search window is almost always enough; fall back to the full range
  return attempt(Math.min(max, want + 400)) ?? attempt(max)
}

/**
 * Picks notes from what the counter actually holds.
 *
 * The counter mainly needs small notes, so the lowest denominations are
 * filled COMPLETELY first: every available ₹10 note, then every ₹20, and so
 * on, until the requested amount is reached. Only the last denomination needed
 * is partly used, and there the smallest total that reaches the amount is
 * chosen. Never uses more notes than available. If the amount is out of reach,
 * every note is allocated and `reachable` is false.
 */
export function allocateNotes(
  closing: Partial<DenominationCount>,
  requested: number
): Allocation {
  // ascending order of value; every note is a multiple of ₹10 -> work in ₹10 units
  const order: NoteKey[] = [...NOTE_KEYS].reverse()
  const unit = order.map((k) => NOTE_VALUE[k] / 10)
  const count = order.map((k) => int(closing[k]))

  const want = Math.max(0, Math.ceil((Number(requested) || 0) / 10))
  const max = count.reduce((s, c, i) => s + c * unit[i], 0)

  const build = (take: number[]) => {
    const notes = {
      notes500: 0,
      notes200: 0,
      notes100: 0,
      notes50: 0,
      notes20: 0,
      notes10: 0,
    }
    order.forEach((k, i) => (notes[k] = take[i]))
    return notes
  }
  const sum = (take: number[]) => take.reduce((s, c, i) => s + c * unit[i], 0) * 10

  if (want === 0) {
    return { notes: build(order.map(() => 0)), total: 0, target: 0, reachable: true }
  }
  if (want > max) {
    return { notes: build(count), total: max * 10, target: want * 10, reachable: false }
  }

  // 1. take every note of the smallest denominations while they still fit
  const take = order.map(() => 0)
  let rem = want
  let i = 0
  for (; i < order.length; i++) {
    const full = count[i] * unit[i]
    if (full > rem) break
    take[i] = count[i]
    rem -= full
  }

  // 2. the remainder comes from the next denominations, overshooting as little as possible
  if (rem > 0) {
    const part = solveMinimum(unit.slice(i), count.slice(i), rem)
    // cannot be null: want <= max and everything below i is already used up
    part!.forEach((c, j) => (take[i + j] = c))
  }

  return { notes: build(take), total: sum(take), target: want * 10, reachable: true }
}

export const nextDayTotal = (d: Partial<DenominationCount>) =>
  calculateClosingCash(d as DenominationCount)

/** Whole, non-negative counts only. Returns a clean copy, or null if invalid. */
export function cleanDenoms(d: unknown): DenominationCount | null {
  if (!d || typeof d !== "object") return null
  const src = d as Record<string, unknown>
  const out = emptyDenoms()
  for (const k of Object.keys(out) as (keyof DenominationCount)[]) {
    const v = Number(src[k] ?? 0)
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) return null
    out[k] = v
  }
  return out
}

/** What can actually be kept: never more of any denomination than was counted. */
export function deriveKeep(
  closing: Partial<DenominationCount>,
  wanted?: Partial<DenominationCount> | null
): DenominationCount {
  const out = emptyDenoms()
  for (const k of Object.keys(out) as (keyof DenominationCount)[]) {
    out[k] = Math.min(int(wanted?.[k]), int(closing[k]))
  }
  return out
}

/**
 * Picks notes for a rupee amount using the LARGEST notes first (the purchase counter
 * handles big sums), never more than were counted. Falls back to the smallest-first
 * allocation when the amount cannot be made exactly.
 */
export function allocateLargestFirst(
  closing: Partial<DenominationCount>,
  amount: number
): DenominationCount {
  const out = emptyDenoms()
  let rem = Math.max(0, Math.round(Number(amount) || 0))
  for (const k of NOTE_KEYS) {
    const take = Math.min(int(closing[k]), Math.floor(rem / NOTE_VALUE[k]))
    out[k] = take
    rem -= take * NOTE_VALUE[k]
  }
  if (rem === 0) return out
  // not exact with big notes: use the exact-or-slightly-above allocation instead
  const a = allocateNotes(closing, amount)
  return { ...emptyDenoms(), ...a.notes }
}
