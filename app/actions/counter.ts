"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import type { DayEntry, Payment, SalesData, DenominationCount } from "@/lib/types"
import { calculateCashSales, calculateExpectedCash, calculateTotalPayments as sumPaymentAmounts } from "@/lib/types"
import { redirect } from "next/navigation"

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

export async function getTodayEntry(): Promise<DayEntry | null> {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    redirect("/")
  }

  const db = await getDatabase()
  const today = new Date().toISOString().split("T")[0]

  let entry = await db.collection<DayEntry>("entries").findOne({
    counterName: user.counterName!,
    date: today,
  })

  if (!entry) {
    // Get previous day's closing cash for opening
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split("T")[0]

    const previousEntry = await db.collection<DayEntry>("entries").findOne({
      counterName: user.counterName!,
      date: yesterdayStr,
      status: "confirmed",
    })

    const openingCash =
      previousEntry?.nextDayOpeningCash ?? (previousEntry ? sumPaymentAmounts(previousEntry.closingDenominations) : 0)

    const openingDenominations = previousEntry?.nextDayOpeningDenominations ?? {
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

    const newEntry: Omit<DayEntry, "_id"> = {
      counterName: user.counterName!,
      date: today,
      openingCash,
      openingCoins: 0,
      openingDenominations,
      payments: [],
      sales: {
        totalSales: 0,
        cardUpiSales: 0,
        creditSales: 0,
      },
      closingDenominations: {
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
      },
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const result = await db.collection<DayEntry>("entries").insertOne(newEntry as any)
    entry = { ...newEntry, _id: result.insertedId.toString() } as DayEntry
  }

  return serializeEntry(entry)
}

export async function getEntryByDate(date: string): Promise<DayEntry | null> {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    redirect("/")
  }

  const db = await getDatabase()

  let entry = await db.collection<DayEntry>("entries").findOne({
    counterName: user.counterName!,
    date: date,
  })

  if (!entry) {
    // Get previous day's closing cash for opening
    const dateObj = new Date(date)
    dateObj.setDate(dateObj.getDate() - 1)
    const previousDateStr = dateObj.toISOString().split("T")[0]

    const previousEntry = await db.collection<DayEntry>("entries").findOne({
      counterName: user.counterName!,
      date: previousDateStr,
      status: "confirmed",
    })

    const openingCash =
      previousEntry?.nextDayOpeningCash ?? (previousEntry ? sumPaymentAmounts(previousEntry.closingDenominations) : 0)

    const openingDenominations = previousEntry?.nextDayOpeningDenominations ?? {
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

    const newEntry: Omit<DayEntry, "_id"> = {
      counterName: user.counterName!,
      date: date,
      openingCash,
      openingCoins: 0,
      openingDenominations,
      payments: [],
      sales: {
        totalSales: 0,
        cardUpiSales: 0,
        creditSales: 0,
      },
      closingDenominations: {
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
      },
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const result = await db.collection<DayEntry>("entries").insertOne(newEntry as any)
    entry = { ...newEntry, _id: result.insertedId.toString() } as DayEntry
  }

  return serializeEntry(entry)
}

export async function addPayment(description: string, amount: number, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const payment: Payment = {
    time: new Date().toISOString(),
    description,
    amount,
  }

  await db.collection<DayEntry>("entries").updateOne(
    {
      counterName: user.counterName!,
      date: targetDate,
      status: "open",
    },
    {
      $push: { payments: payment as any },
      $set: { updatedAt: new Date() },
    },
  )

  return { success: true }
}

export async function deletePayment(index: number, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const entry = await db.collection<DayEntry>("entries").findOne({
    counterName: user.counterName!,
    date: targetDate,
    status: "open",
  })

  if (entry && entry.payments) {
    entry.payments.splice(index, 1)
    await db.collection<DayEntry>("entries").updateOne(
      {
        counterName: user.counterName!,
        date: targetDate,
        status: "open",
      },
      {
        $set: {
          payments: entry.payments,
          updatedAt: new Date(),
        },
      },
    )
  }

  return { success: true }
}

export async function updateSales(sales: SalesData, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  await db.collection<DayEntry>("entries").updateOne(
    {
      counterName: user.counterName!,
      date: targetDate,
      status: "open",
    },
    {
      $set: {
        sales,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

export async function updateClosingCash(denominations: DenominationCount, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  await db.collection<DayEntry>("entries").updateOne(
    {
      counterName: user.counterName!,
      date: targetDate,
      status: "open",
    },
    {
      $set: {
        closingDenominations: denominations,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

export async function submitDay(date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const entry = await db.collection<DayEntry>("entries").findOne({
    counterName: user.counterName!,
    date: targetDate,
    status: "open",
  })

  if (!entry) {
    return { error: "Entry not found" }
  }

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const totalPayments = sumPaymentAmounts(entry.payments)
  const cashSales = calculateCashSales(entry.sales, isFashionBoth)
  const expectedCash = calculateExpectedCash(entry.openingCash, cashSales, totalPayments)
  const actualCash = calculateDenominationTotal(entry.closingDenominations)
  const shortage = expectedCash - actualCash

  console.log("[v0] submitDay - FULL BREAKDOWN:")
  console.log("[v0] submitDay - openingCash:", entry.openingCash)
  console.log("[v0] submitDay - cashSales:", cashSales)
  console.log("[v0] submitDay - totalPayments:", totalPayments)
  console.log("[v0] submitDay - expectedCash (opening + cashSales - payments):", expectedCash)
  console.log("[v0] submitDay - actualCash:", actualCash)
  console.log("[v0] submitDay - shortage (expected - actual):", shortage)
  console.log("[v0] submitDay - STORING TO DB:", {
    submittedExpectedCash: expectedCash,
    submittedActualCash: actualCash,
    submittedShortage: shortage,
  })

  await db.collection<DayEntry>("entries").updateOne(
    {
      counterName: user.counterName!,
      date: targetDate,
      status: "open",
    },
    {
      $set: {
        status: "submitted",
        submittedAt: new Date(),
        submittedExpectedCash: expectedCash,
        submittedActualCash: actualCash,
        submittedShortage: shortage,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

export async function updatePayment(index: number, description: string, amount: number, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const entry = await db.collection<DayEntry>("entries").findOne({
    counterName: user.counterName!,
    date: targetDate,
    status: "open",
  })

  if (entry && entry.payments && entry.payments[index]) {
    entry.payments[index] = {
      ...entry.payments[index],
      description,
      amount,
    }

    await db.collection<DayEntry>("entries").updateOne(
      {
        counterName: user.counterName!,
        date: targetDate,
        status: "open",
      },
      {
        $set: {
          payments: entry.payments,
          updatedAt: new Date(),
        },
      },
    )
  }

  return { success: true }
}

export async function setNextDayOpening(amount: number, denominations: DenominationCount, date?: string) {
  const user = await getSession()
  if (!user || user.role !== "counter") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const targetDate = date || new Date().toISOString().split("T")[0]

  await db.collection<DayEntry>("entries").updateOne(
    {
      counterName: user.counterName!,
      date: targetDate,
    },
    {
      $set: {
        nextDayOpeningCash: amount,
        nextDayOpeningDenominations: denominations,
        updatedAt: new Date(),
      },
    },
  )

  return { success: true }
}

function calculateDenominationTotal(denominations: DenominationCount): number {
  return (
    (denominations.notes500 || 0) * 500 +
    (denominations.notes200 || 0) * 200 +
    (denominations.notes100 || 0) * 100 +
    (denominations.notes50 || 0) * 50 +
    (denominations.notes20 || 0) * 20 +
    (denominations.notes10 || 0) * 10 +
    (denominations.coins10 || 0) * 10 +
    (denominations.coins5 || 0) * 5 +
    (denominations.coins2 || 0) * 2 +
    (denominations.coins1 || 0) * 1
  )
}
