"use server"

import getClientPromise, { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import { ObjectId } from "mongodb"
import { entriesCollection, parseObjectId } from "@/lib/entries"
import { getOrCreateDay } from "@/lib/purchase-service"
import { todayIST } from "@/lib/report"
import { isDateString, parseMoney } from "@/lib/validation"
import { fail, ok } from "@/lib/action-result"

/**
 * Cash transfers between counters, the Purchase counter and the Admin.
 *
 * A transfer moves cash in two steps, so both sides stay in agreement:
 *   - the SENDER's cash goes down the moment the transfer is created
 *   - the RECEIVER's cash goes up when they accept it
 *
 * Where each side is recorded:
 *   - a counter: as a locked "Money out" / "Money in" payment on its day (so the
 *     expected-cash formula and shortage need no changes)
 *   - the Purchase counter: as a cash-out / cash-in line on its purchase day
 *   - the Admin: nowhere; the admin just confirms cash sent to them was received
 */

const ADMIN_NAME = "Admin"
const PURCHASE_NAME = "Purchase"
const MAX_AMOUNT = 10_000_000

export interface Transfer {
  _id: string
  date: string
  from: string
  to: string
  amount: number
  note: string
  status: "pending" | "accepted" | "cancelled"
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
}

function serialize(t: any): Transfer {
  const iso = (d: any) => (d instanceof Date ? d.toISOString() : d)
  return {
    _id: t._id.toString(),
    date: t.date,
    from: t.from,
    to: t.to,
    amount: t.amount,
    note: t.note || "",
    status: t.status,
    createdAt: iso(t.createdAt),
    resolvedAt: iso(t.resolvedAt),
    resolvedBy: t.resolvedBy,
  }
}

/** Thrown inside a transaction to roll everything back with a readable reason. */
class TransferError extends Error {}

async function runTransaction(work: (session: any) => Promise<void>) {
  const client = await getClientPromise()
  const session = client.startSession()
  try {
    await session.withTransaction(() => work(session))
    return ok()
  } catch (e) {
    if (e instanceof TransferError) return fail(e.message)
    console.error("transfer transaction failed", e)
    return fail("Something went wrong. Nothing was changed.")
  } finally {
    await session.endSession()
  }
}

/** Who is using transfers: a counter, the purchase counter or the admin. */
async function whoAmI() {
  const user = await getSession()
  if (!user) return null
  if (user.role === "counter" && user.counterName)
    return { kind: "counter" as const, name: user.counterName, username: user.username }
  if (user.role === "purchase") return { kind: "purchase" as const, name: PURCHASE_NAME, username: user.username }
  if (user.role === "admin") return { kind: "admin" as const, name: ADMIN_NAME, username: user.username }
  return null
}

/* ---------------- WHO CAN RECEIVE ---------------- */

export async function getTransferTargets(): Promise<string[]> {
  const me = await whoAmI()
  if (!me) return []

  const db = await getDatabase()
  const users = await db.collection("users").find({ role: "counter" }).toArray()
  const counters = users
    .map((u: any) => u.counterName as string)
    .filter((n) => n && n !== me.name)
    .sort()

  if (me.kind === "counter") return [...counters, PURCHASE_NAME, ADMIN_NAME]
  if (me.kind === "purchase") return [...counters, ADMIN_NAME]
  return [...counters, PURCHASE_NAME] // admin
}

/* ---------------- CREATE ---------------- */

export async function createTransfer(to: string, amount: number, note: string) {
  const me = await whoAmI()
  if (!me) return fail("Unauthorized")

  const targets = await getTransferTargets()
  if (!targets.includes(to)) return fail("Choose who to transfer to")

  const amt = parseMoney(amount, { min: 0.01, max: MAX_AMOUNT })
  if (amt === null) return fail("Enter a valid amount")

  const cleanNote = (typeof note === "string" ? note : "").trim().slice(0, 200)
  const date = todayIST()
  const db = await getDatabase()
  const transferId = new ObjectId()

  return runTransaction(async (session) => {
    // 1. the sender's cash goes down now
    if (me.kind === "counter") {
      const pushed = await entriesCollection(db).updateOne(
        { counterName: me.name, date, status: "open", openingVerified: true },
        {
          $push: {
            payments: {
              description: `Transfer to ${to}`,
              amount: amt,
              type: "OUT",
              time: new Date().toISOString(),
              transferId: transferId.toString(),
            },
          },
          $set: { updatedAt: new Date() },
        },
        { session }
      )
      if (pushed.matchedCount === 0)
        throw new TransferError(
          "Your day must be open and the opening cash verified before transferring cash"
        )
    } else if (me.kind === "purchase") {
      const day = await getOrCreateDay(db, date, session)
      if (day.status !== "open") throw new TransferError("Today's purchase day is already submitted")
      await db.collection("purchase_days").updateOne(
        { _id: day._id, status: "open" },
        {
          $push: {
            cashOut: {
              id: transferId.toString(),
              transferId: transferId.toString(),
              party: to,
              amount: amt,
              time: new Date().toISOString(),
              note: cleanNote || undefined,
            },
          } as any,
          $set: { updatedAt: new Date() },
        },
        { session }
      )
    }
    // an admin has no drawer to update

    // 2. record the transfer, waiting for the other side
    await db.collection("transfers").insertOne(
      {
        _id: transferId,
        date,
        from: me.name,
        to,
        amount: amt,
        note: cleanNote,
        status: "pending",
        createdAt: new Date(),
        createdBy: me.username,
      },
      { session }
    )
  })
}

/* ---------------- READ (COUNTER / PURCHASE / ADMIN) ---------------- */

/**
 * Transfers to and from the signed-in person.
 * With no date (or today) it also includes anything still waiting from earlier days.
 * With an earlier date it returns only what was sent on that day.
 */
export async function getMyTransfers(date?: string): Promise<{
  incoming: Transfer[]
  outgoing: Transfer[]
}> {
  const me = await whoAmI()
  if (!me) return { incoming: [], outgoing: [] }

  const db = await getDatabase()
  const today = todayIST()
  const day = date && isDateString(date) ? date : today
  const filter = day === today ? { $or: [{ status: "pending" }, { date: today }] } : { date: day }

  const [incoming, outgoing] = await Promise.all([
    db.collection("transfers").find({ to: me.name, ...filter }).sort({ createdAt: -1 }).toArray(),
    db.collection("transfers").find({ from: me.name, ...filter }).sort({ createdAt: -1 }).toArray(),
  ])

  return { incoming: incoming.map(serialize), outgoing: outgoing.map(serialize) }
}

/* ---------------- ACCEPT (RECEIVING COUNTER OR PURCHASE) ---------------- */

export async function acceptTransfer(id: string) {
  const me = await whoAmI()
  if (!me || me.kind === "admin") return fail("Unauthorized")
  const transferObjectId = parseObjectId(id)
  if (!transferObjectId) return fail("Invalid transfer")

  const date = todayIST()
  const db = await getDatabase()

  return runTransaction(async (session) => {
    const claimed = await db.collection("transfers").findOneAndUpdate(
      { _id: transferObjectId, to: me.name, status: "pending" },
      { $set: { status: "accepted", resolvedAt: new Date(), resolvedBy: me.username } },
      { session, returnDocument: "after" }
    )
    if (!claimed) throw new TransferError("This transfer is no longer waiting for you")

    if (me.kind === "counter") {
      const pushed = await entriesCollection(db).updateOne(
        { counterName: me.name, date, status: "open", openingVerified: true },
        {
          $push: {
            payments: {
              description: `Transfer from ${claimed.from}`,
              amount: claimed.amount,
              type: "IN",
              time: new Date().toISOString(),
              transferId: id,
            },
          },
          $set: { updatedAt: new Date() },
        },
        { session }
      )
      if (pushed.matchedCount === 0)
        throw new TransferError(
          "Your day must be open and the opening cash verified before accepting cash"
        )
    } else {
      const day = await getOrCreateDay(db, date, session)
      if (day.status !== "open") throw new TransferError("Today's purchase day is already submitted")
      await db.collection("purchase_days").updateOne(
        { _id: day._id, status: "open" },
        {
          $push: {
            cashIn: {
              id,
              transferId: id,
              party: claimed.from,
              amount: claimed.amount,
              time: new Date().toISOString(),
              note: claimed.note || undefined,
            },
          } as any,
          $set: { updatedAt: new Date() },
        },
        { session }
      )
    }
  })
}

/* ---------------- CANCEL (SENDER, WHILE PENDING) ---------------- */

export async function cancelTransfer(id: string) {
  const me = await whoAmI()
  if (!me) return fail("Unauthorized")
  const transferObjectId = parseObjectId(id)
  if (!transferObjectId) return fail("Invalid transfer")

  const db = await getDatabase()

  return runTransaction(async (session) => {
    const claimed = await db.collection("transfers").findOneAndUpdate(
      { _id: transferObjectId, from: me.name, status: "pending" },
      { $set: { status: "cancelled", resolvedAt: new Date(), resolvedBy: me.username } },
      { session, returnDocument: "after" }
    )
    if (!claimed) throw new TransferError("This transfer can no longer be cancelled")

    // give the cash back to the sender's drawer
    if (me.kind === "counter") {
      const pulled = await entriesCollection(db).updateOne(
        { counterName: me.name, date: claimed.date, status: "open" },
        { $pull: { payments: { transferId: id } }, $set: { updatedAt: new Date() } },
        { session }
      )
      if (pulled.matchedCount === 0)
        throw new TransferError(
          "That day is already submitted, so the transfer cannot be cancelled. Ask the admin."
        )
    } else if (me.kind === "purchase") {
      const pulled = await db.collection("purchase_days").updateOne(
        { date: claimed.date, status: "open" },
        { $pull: { cashOut: { transferId: id } } as any, $set: { updatedAt: new Date() } },
        { session }
      )
      if (pulled.matchedCount === 0)
        throw new TransferError(
          "That purchase day is already submitted, so the transfer cannot be cancelled. Ask the admin."
        )
    }
  })
}

/* ---------------- ADMIN / SUPERVISOR ---------------- */

export async function getTransfersForDate(date: string): Promise<Transfer[]> {
  const user = await getSession()
  if (!user || (user.role !== "admin" && user.role !== "supervisor")) return []

  const day = isDateString(date) ? date : todayIST()
  const db = await getDatabase()
  const docs = await db
    .collection("transfers")
    .find({ $or: [{ date: day }, { status: "pending", to: ADMIN_NAME }] })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(serialize)
}

/* Admin confirms the cash sent to Admin has been received */
export async function acknowledgeTransfer(id: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")
  const transferObjectId = parseObjectId(id)
  if (!transferObjectId) return fail("Invalid transfer")

  const db = await getDatabase()
  const res = await db.collection("transfers").updateOne(
    { _id: transferObjectId, to: ADMIN_NAME, status: "pending" },
    { $set: { status: "accepted", resolvedAt: new Date(), resolvedBy: user.username } }
  )
  if (res.matchedCount === 0) return fail("Not waiting for acknowledgement")
  return ok()
}
