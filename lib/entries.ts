import { ObjectId, type Collection, type Db } from "mongodb"
import type { DayEntry, DenominationCount } from "./types"
import { calculateClosingCash } from "./types"
import { emptyDenoms } from "./next-day"

/** An entry as stored in MongoDB (the _id is an ObjectId, not a string). */
export type EntryDoc = Omit<DayEntry, "_id"> & { _id: ObjectId }

export const entriesCollection = (db: Db): Collection<EntryDoc> =>
  db.collection<EntryDoc>("entries")

/** A valid ObjectId from untrusted input, or null (never throws). */
export function parseObjectId(id: unknown): ObjectId | null {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id) ? new ObjectId(id) : null
}

const STATUS_RANK: Record<string, number> = { confirmed: 3, submitted: 2, open: 1 }

/**
 * The entry for a counter on a date. Older data can hold a stray empty
 * duplicate next to the real entry, so the furthest-along one wins.
 */
export async function findEntry(
  db: Db,
  counterName: string,
  date: string
): Promise<EntryDoc | null> {
  const found = await entriesCollection(db).find({ counterName, date }).toArray()
  if (found.length <= 1) return found[0] ?? null
  return found.sort((a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0))[0]
}

/**
 * The last closed day before `beforeDate`, if the counter's most recent entry
 * was submitted or confirmed. This is what a new day opens with, so a closed
 * day (Sunday, a holiday) does not reset the drawer to zero.
 * Returns null when there is no earlier entry or it was never closed.
 */
export async function findPreviousClosedEntry(
  db: Db,
  counterName: string,
  beforeDate: string
): Promise<EntryDoc | null> {
  const latest = await entriesCollection(db)
    .find({ counterName, date: { $lt: beforeDate } })
    .sort({ date: -1 })
    .limit(1)
    .toArray()
  if (latest.length === 0) return null

  const sameDay = await entriesCollection(db)
    .find({ counterName, date: latest[0].date })
    .toArray()
  const best = sameDay.sort(
    (a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0)
  )[0]

  return best.status === "open" ? null : best
}

/** Opening cash and denominations carried over from a closed day. */
export function carryForward(prev: EntryDoc | null): {
  cash: number
  denominations: DenominationCount
} {
  if (!prev) return { cash: 0, denominations: emptyDenoms() }

  const denominations = { ...emptyDenoms(), ...(prev.nextDayOpeningDenominations || {}) }
  const cash =
    typeof prev.nextDayOpeningCash === "number"
      ? prev.nextDayOpeningCash
      : calculateClosingCash(denominations)
  return { cash, denominations }
}

/** Plain, JSON-safe copy of a document: ObjectIds and Dates become strings. */
export function toPlain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value instanceof ObjectId) return value.toString()
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = toPlain(v)
    }
    return out
  }
  return value
}

/** Entry in the shape the UI expects, safe to send from a server action. */
export function serializeEntry(doc: EntryDoc): DayEntry {
  const e = toPlain(doc) as DayEntry
  return {
    ...e,
    payments: (e.payments || []).map((p) => ({ ...p, type: p.type || "OUT" })),
    paymentRefNumber: e.paymentRefNumber || "",
    openingVerifyStatus: e.openingVerifyStatus || (e.openingVerified ? "verified" : undefined),
    openingHistory: e.openingHistory || [],
    openingCheckedDenoms: e.openingCheckedDenoms || [],
    availableCheckedDenoms: e.availableCheckedDenoms || [],
  }
}
