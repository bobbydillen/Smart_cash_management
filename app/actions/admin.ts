"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import type { DayEntry } from "@/lib/types"
import {
  calculateCashSales,
  calculateClosingCash,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import {
  carryForward,
  entriesCollection,
  findPreviousClosedEntry,
  parseObjectId,
  serializeEntry,
  type EntryDoc,
} from "@/lib/entries"
import { isDateString, parseMoney } from "@/lib/validation"
import { fail, ok } from "@/lib/action-result"
import { todayIST } from "@/lib/report"
import { redirect } from "next/navigation"


/** Admin or supervisor, or the visitor is sent to the login page. */
async function requireViewer() {
  const user = await getSession()
  if (!user || (user.role !== "admin" && user.role !== "supervisor")) {
    redirect("/")
  }
  return user
}

/* =====================================================
   READ (ADMIN + SUPERVISOR)
   ===================================================== */

export async function getAllEntries(date?: string): Promise<DayEntry[]> {
  await requireViewer()

  const targetDate = date && isDateString(date) ? date : todayIST()

  const db = await getDatabase()
  const entries = await entriesCollection(db)
    .find({ date: targetDate })
    .sort({ counterName: 1 })
    .toArray()

  return entries.map(serializeEntry)
}

/**
 * Every shop counter that has a login. A counter's day is only created when it
 * signs in, so the dashboard uses this list to show counters that have not started.
 */
export async function getCounterNames(): Promise<string[]> {
  await requireViewer()
  const db = await getDatabase()
  const users = await db.collection("users").find({ role: "counter" }).toArray()
  return users
    .map((u: any) => u.counterName as string)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

/** Entries for a date range, used by the weekly / monthly reports. */
export async function getEntriesInRange(start: string, end: string): Promise<DayEntry[]> {
  await requireViewer()

  if (!isDateString(start) || !isDateString(end) || start > end) return []

  // keep one request to roughly a quarter
  const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000
  if (days > 92) return []

  const db = await getDatabase()
  const entries = await entriesCollection(db)
    .find({ date: { $gte: start, $lte: end } })
    .sort({ date: 1, counterName: 1 })
    .toArray()

  return entries.map(serializeEntry)
}

/* =====================================================
   CONFIRM / UNLOCK (ADMIN ONLY)
   ===================================================== */

export async function confirmEntry(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")

  const _id = parseObjectId(id)
  if (!_id) return fail("Invalid entry id")

  const db = await getDatabase()
  const res = await entriesCollection(db).updateOne(
    { _id, status: "submitted" },
    {
      $set: {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: user.username,
        updatedAt: new Date(),
      },
    }
  )
  if (res.matchedCount === 0) return fail("Only a submitted day can be confirmed")

  return ok()
}

export async function unlockEntry(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")

  const _id = parseObjectId(id)
  if (!_id) return fail("Invalid entry id")

  const db = await getDatabase()
  const res = await entriesCollection(db).updateOne(
    { _id, status: { $in: ["submitted", "confirmed"] } },
    {
      $set: { status: "open", updatedAt: new Date() },
      $unset: { submittedAt: "", confirmedAt: "", confirmedBy: "" },
    }
  )
  if (res.matchedCount === 0) return fail("This day is already open")

  return ok()
}

/* =====================================================
   OPENING CASH OVERRIDE (ADMIN ONLY)
   ===================================================== */

/**
 * Keeps expected / actual / shortage in sync after an admin edit, so the
 * dashboard shows the same figures as the detail view. Open entries have no
 * submitted totals yet, so they are skipped.
 */
async function recalculateSubmittedTotals(entry: EntryDoc) {
  if (entry.status === "open") return

  const db = await getDatabase()
  const cashSales = calculateCashSales(entry.sales, entry.counterName === "Smart Fashion (Both)")
  const expectedCash = calculateExpectedCashWithInOut(
    entry.openingCash,
    cashSales,
    entry.payments || []
  )
  const actualCash = calculateClosingCash(entry.closingDenominations)

  await entriesCollection(db).updateOne(
    { _id: entry._id },
    {
      $set: {
        submittedExpectedCash: expectedCash,
        submittedActualCash: actualCash,
        submittedShortage: expectedCash - actualCash,
      },
    }
  )
}

/** For the details popup: what the opening cash would be without any override. */
export async function getOpeningOriginal(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")

  const _id = parseObjectId(id)
  if (!_id) return fail("Invalid entry id")

  const db = await getDatabase()
  const entry = await entriesCollection(db).findOne({ _id })
  if (!entry) return fail("Entry not found")

  const prev = await findPreviousClosedEntry(db, entry.counterName, entry.date)
  return ok({ cash: carryForward(prev).cash })
}

export async function updateEntryOpeningCash(id: string, openingCash: number) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")

  const _id = parseObjectId(id)
  if (!_id) return fail("Invalid entry id")

  const cash = parseMoney(openingCash)
  if (cash === null) return fail("Enter a valid opening cash amount")

  const db = await getDatabase()
  const col = entriesCollection(db)
  const current = await col.findOne({ _id })
  if (!current) return fail("Entry not found")

  await col.updateOne(
    { _id },
    {
      $set: {
        openingCash: cash,
        // remember who changed it and the very first amount, so it can be reverted
        ...(current.openingOverride
          ? {}
          : {
              openingOverride: {
                by: user.username,
                at: new Date(),
                fromCash: current.openingCash,
              },
            }),
        openingVerified: true,
        openingVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  )

  await recalculateSubmittedTotals({ ...current, openingCash: cash })

  return ok()
}

/**
 * Removes an override: the opening cash goes back to what the previous closed
 * day kept, the same rule used when a day is first created.
 */
export async function revertOpeningOverride(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")

  const _id = parseObjectId(id)
  if (!_id) return fail("Invalid entry id")

  const db = await getDatabase()
  const col = entriesCollection(db)
  const entry = await col.findOne({ _id })
  if (!entry) return fail("Entry not found")

  const { cash, denominations } = carryForward(
    await findPreviousClosedEntry(db, entry.counterName, entry.date)
  )

  await col.updateOne(
    { _id },
    {
      $set: {
        openingCash: cash,
        openingDenominations: denominations,
        updatedAt: new Date(),
      },
      $unset: { openingOverride: "" },
    }
  )

  await recalculateSubmittedTotals({ ...entry, openingCash: cash })

  return ok({ openingCash: cash })
}
