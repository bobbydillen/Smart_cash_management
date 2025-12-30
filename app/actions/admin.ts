"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import type { DayEntry, DenominationCount } from "@/lib/types"
import { redirect } from "next/navigation"
import { ObjectId } from "mongodb"

function serializeEntry(entry: any): DayEntry {
  return {
    ...entry,
    _id: entry._id?.toString(),
    date: typeof entry.date === "string" ? entry.date : entry.date?.toISOString?.() || entry.date,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
    submittedAt: entry.submittedAt instanceof Date ? entry.submittedAt.toISOString() : entry.submittedAt,
    confirmedAt: entry.confirmedAt instanceof Date ? entry.confirmedAt.toISOString() : entry.confirmedAt,
    payments:
      entry.payments?.map((p: any) => ({
        ...p,
        time: p.time instanceof Date ? p.time.toISOString() : p.time,
      })) || [],
  }
}

export async function getAllEntries(date?: string): Promise<DayEntry[]> {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    redirect("/")
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const entries = await db.collection<DayEntry>("entries").find({ date: targetDate }).sort({ counterName: 1 }).toArray()

  return entries.map(serializeEntry)
}

export async function getEntryById(id: string): Promise<DayEntry | null> {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    redirect("/")
  }

  const db = await getDatabase()
  const entry = await db.collection<DayEntry>("entries").findOne({ _id: new ObjectId(id) })

  if (!entry) return null

  return serializeEntry(entry)
}

export async function confirmEntry(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()

  await db.collection<DayEntry>("entries").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: user.username,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

export async function unlockEntry(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()

  await db.collection<DayEntry>("entries").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "open",
        updatedAt: new Date(),
      },
      $unset: {
        submittedAt: "",
        confirmedAt: "",
        confirmedBy: "",
      },
    },
  )

  return { success: true }
}

export async function updateEntryOpeningCash(id: string, openingCash: number) {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()

  await db.collection<DayEntry>("entries").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        openingCash,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

export async function updateEntryClosingCash(id: string, denominations: DenominationCount) {
  const user = await getSession()
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()

  await db.collection<DayEntry>("entries").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        closingDenominations: denominations,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}
