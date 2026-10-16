import { ObjectId, type ClientSession, type Db, type Document } from "mongodb"
import type { DenominationCount } from "./types"
import { calculateClosingCash } from "./types"
import { cleanDenoms, deriveKeep, emptyDenoms, subtractDenoms } from "./next-day"
import { parseObjectId, toPlain } from "./entries"
import { fail, ok, type Failure } from "./action-result"
import { isDateString, parseMoney, parseText } from "./validation"
import { todayIST } from "./report"
import { groupFilter } from "./incharge-group"
import { nameKey, properCase } from "./text-format"
import {
  billStatus,
  expectedPurchaseCash,
  round2,
  vendorBalance,
  type Bank,
  type Bill,
  type BillWithStatus,
  type Cheque,
  type DaySummary,
  type PayMode,
  type PaymentSource,
  type PurchaseDay,
  type PurchasePayment,
  type Vendor,
  type VendorBalance,
  type Voucher,
} from "./purchase"

/**
 * Purchase counter logic. Plain functions over the database, so the rules can be
 * tested without a browser. The server actions in app/actions/purchase.ts only
 * add the sign-in check and call these.
 */

export interface Actor {
  username: string
}

/* ================= COLLECTIONS ================= */

const vendorsCol = (db: Db) => db.collection("vendors")
const billsCol = (db: Db) => db.collection("purchase_bills")
const paymentsCol = (db: Db) => db.collection("purchase_payments")
const chequesCol = (db: Db) => db.collection("cheques")
const vouchersCol = (db: Db) => db.collection("vouchers")
const daysCol = (db: Db) => db.collection("purchase_days")
const banksCol = (db: Db) => db.collection("banks")

/* ================= SMALL HELPERS ================= */

class PurchaseError extends Error {}
const stop = (message: string): never => {
  throw new PurchaseError(message)
}

/** Runs several writes as one: either all happen or none. */
async function atomic<T>(
  db: Db,
  work: (session: ClientSession) => Promise<T>
): Promise<T | Failure> {
  const session = db.client.startSession()
  try {
    let result!: T
    await session.withTransaction(async () => {
      result = await work(session)
    })
    return result
  } catch (e) {
    if (e instanceof PurchaseError) return fail(e.message)
    console.error("[purchase] transaction failed", e)
    return fail("Something went wrong. Nothing was changed.")
  } finally {
    await session.endSession()
  }
}

const plain = <T>(doc: Document | null): T => toPlain(doc) as T

const optionalText = (v: unknown, max: number): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined
  return parseText(v, max) ?? undefined
}

const isBad = (v: unknown, max: number) =>
  v !== undefined && v !== null && v !== "" && parseText(v, max) === null

/** The name must be one of the in-charges the admin set up. */
async function checkInCharge(db: Db, name: unknown): Promise<string | Failure> {
  const clean = parseText(name, 80)
  if (!clean) return fail("Select who is handling this")
  const found = await db.collection("incharges").findOne({ name: clean, active: true, ...groupFilter("purchase") })
  return found ? clean : fail("Select a valid purchase staff member")
}

/* ================= VENDORS ================= */

export interface VendorInput {
  name?: unknown
  phone?: unknown
  contactPerson?: unknown
  address?: unknown
  gstin?: unknown
  items?: unknown
  notes?: unknown
  openingBalance?: unknown
}

const tidy = (v: string | undefined) => (v ? properCase(v) : undefined)

function cleanVendor(input: VendorInput): Failure | { fields: Document } {
  const typedName = parseText(input.name, 80)
  if (!typedName) return fail("Enter the vendor's name")
  // names, items and addresses are saved with a capital at the start of every word
  const name = properCase(typedName)
  for (const [v, max, label] of [
    [input.phone, 30, "Phone"],
    [input.contactPerson, 80, "Contact person"],
    [input.address, 200, "Address"],
    [input.gstin, 20, "GST number"],
    [input.items, 300, "Items supplied"],
    [input.notes, 500, "Notes"],
  ] as const) {
    if (isBad(v, max)) return fail(`${label} is too long`)
  }
  const opening =
    input.openingBalance === undefined || input.openingBalance === ""
      ? 0
      : parseMoney(input.openingBalance)
  if (opening === null) return fail("Opening balance must be a valid amount")

  return {
    fields: {
      name,
      nameLower: name.toLowerCase(),
      phone: optionalText(input.phone, 30),
      contactPerson: tidy(optionalText(input.contactPerson, 80)),
      address: tidy(optionalText(input.address, 200)),
      gstin: optionalText(input.gstin, 20)?.toUpperCase(),
      items: tidy(optionalText(input.items, 300)),
      notes: optionalText(input.notes, 500),
      openingBalance: opening,
    },
  }
}

/** The vendor that already has this name (ignoring capitals, spaces and punctuation), if any. */
async function sameNameVendor(db: Db, name: string, exceptId?: ObjectId): Promise<string | null> {
  const key = nameKey(name)
  const all = await vendorsCol(db).find({}, { projection: { name: 1 } }).toArray()
  const hit = all.find((v) => nameKey(v.name) === key && (!exceptId || !v._id.equals(exceptId)))
  return hit ? (hit.name as string) : null
}

export async function createVendor(db: Db, actor: Actor, input: VendorInput) {
  const cleaned = cleanVendor(input)
  if ("error" in cleaned) return cleaned

  const dup = await sameNameVendor(db, cleaned.fields.name as string)
  if (dup) return fail(`A vendor with this name already exists: ${dup}`)

  const res = await vendorsCol(db).insertOne({
    ...cleaned.fields,
    active: true,
    createdAt: new Date(),
    createdBy: actor.username,
  })
  return ok({ vendorId: res.insertedId.toString() })
}

export async function updateVendor(db: Db, id: string, input: VendorInput) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Vendor not found")
  const cleaned = cleanVendor(input)
  if ("error" in cleaned) return cleaned

  const clash = await sameNameVendor(db, cleaned.fields.name as string, _id)
  if (clash) return fail(`A vendor with this name already exists: ${clash}`)

  const res = await vendorsCol(db).updateOne({ _id }, { $set: { ...cleaned.fields, updatedAt: new Date() } })
  if (res.matchedCount === 0) return fail("Vendor not found")
  return ok()
}

export async function setVendorActive(db: Db, id: string, active: boolean) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Vendor not found")
  await vendorsCol(db).updateOne({ _id }, { $set: { active: !!active } })
  return ok()
}

/** Balances for every vendor, from three small aggregations. */
async function balancesByVendor(db: Db): Promise<Map<string, VendorBalance>> {
  const [billed, paid, pending, vendors] = await Promise.all([
    billsCol(db).aggregate([{ $group: { _id: "$vendorId", total: { $sum: "$amount" } } }]).toArray(),
    paymentsCol(db)
      .aggregate([
        { $match: { voided: { $ne: true }, settlesVoucherId: null } },
        { $group: { _id: "$vendorId", total: { $sum: "$amount" } } },
      ])
      .toArray(),
    vouchersCol(db)
      .aggregate([
        { $match: { status: "pending" } },
        { $group: { _id: "$vendorId", total: { $sum: "$amount" } } },
      ])
      .toArray(),
    vendorsCol(db).find({}, { projection: { openingBalance: 1 } }).toArray(),
  ])

  const sumOf = (rows: Document[]) => new Map(rows.map((r) => [String(r._id), r.total as number]))
  const b = sumOf(billed)
  const p = sumOf(paid)
  const v = sumOf(pending)

  const out = new Map<string, VendorBalance>()
  for (const vendor of vendors) {
    const key = String(vendor._id)
    out.set(key, vendorBalance(vendor.openingBalance || 0, b.get(key) || 0, p.get(key) || 0, v.get(key) || 0))
  }
  return out
}

export interface VendorRow extends Vendor {
  balance: VendorBalance
}

export async function listVendors(db: Db): Promise<VendorRow[]> {
  const [vendors, balances] = await Promise.all([
    vendorsCol(db).find({}).sort({ nameLower: 1 }).toArray(),
    balancesByVendor(db),
  ])
  return vendors.map((d) => ({
    ...plain<Vendor>(d),
    balance: balances.get(String(d._id)) ?? vendorBalance(0, 0, 0, 0),
  }))
}

export interface VendorDetail {
  vendor: Vendor
  balance: VendorBalance
  bills: BillWithStatus[]
  payments: PurchasePayment[]
  cheques: Cheque[]
  vouchers: Voucher[]
}

export async function getVendorDetail(db: Db, id: string): Promise<VendorDetail | null> {
  const _id = parseObjectId(id)
  if (!_id) return null
  const vendorDoc = await vendorsCol(db).findOne({ _id })
  if (!vendorDoc) return null

  const [billDocs, payDocs, chequeDocs, voucherDocs] = await Promise.all([
    billsCol(db).find({ vendorId: _id }).sort({ billDate: -1, createdAt: -1 }).toArray(),
    paymentsCol(db).find({ vendorId: _id }).sort({ date: -1, createdAt: -1 }).toArray(),
    chequesCol(db).find({ vendorId: _id }).sort({ chequeDate: -1 }).toArray(),
    vouchersCol(db).find({ vendorId: _id }).sort({ issuedDate: -1 }).toArray(),
  ])

  const payments = payDocs.map((d) => plain<PurchasePayment>(d))
  const vouchers = voucherDocs.map((d) => plain<Voucher>(d))
  const vendor = plain<Vendor>(vendorDoc)

  const paidByBill = new Map<string, number>()
  let paidTotal = 0
  for (const p of payments) {
    if (p.voided || p.settlesVoucherId) continue
    paidTotal += p.amount
    if (p.billId) paidByBill.set(p.billId, (paidByBill.get(p.billId) || 0) + p.amount)
  }

  const bills = billDocs.map((d) => {
    const bill = plain<Bill>(d)
    const paid = round2(paidByBill.get(bill._id) || 0)
    return {
      ...bill,
      paid,
      outstanding: round2(bill.amount - paid),
      status: billStatus(bill.amount, paid),
    }
  })

  const billed = bills.reduce((s, b) => s + b.amount, 0)
  const pending = vouchers.filter((v) => v.status === "pending").reduce((s, v) => s + v.amount, 0)

  return {
    vendor,
    balance: vendorBalance(vendor.openingBalance || 0, billed, paidTotal, pending),
    bills,
    payments,
    cheques: chequeDocs.map((d) => plain<Cheque>(d)),
    vouchers,
  }
}

/* ================= BILLS ================= */

export interface BillInput {
  vendorId?: unknown
  billNumber?: unknown
  billDate?: unknown
  amount?: unknown
  items?: unknown
  dueDate?: unknown
  notes?: unknown
}

function cleanBill(input: BillInput): Failure | { fields: Document } {
  const billNumber = parseText(input.billNumber, 40)
  if (!billNumber) return fail("Enter the bill number")
  if (!isDateString(input.billDate)) return fail("Enter the bill date")
  if (input.billDate > todayIST()) return fail("The bill date cannot be in the future")
  const amount = parseMoney(input.amount, { min: 0.01 })
  if (amount === null) return fail("Enter the bill amount")
  if (isBad(input.items, 300)) return fail("Items are too long")
  if (isBad(input.notes, 500)) return fail("Notes are too long")
  if (input.dueDate !== undefined && input.dueDate !== "" && !isDateString(input.dueDate))
    return fail("Due date is not valid")

  return {
    fields: {
      billNumber,
      billNumberLower: billNumber.toLowerCase(),
      billDate: input.billDate,
      amount,
      items: optionalText(input.items, 300),
      dueDate: input.dueDate ? (input.dueDate as string) : undefined,
      notes: optionalText(input.notes, 500),
    },
  }
}

export async function createBill(db: Db, actor: Actor, input: BillInput) {
  const vendorId = parseObjectId(input.vendorId)
  if (!vendorId) return fail("Choose a vendor")
  if (!(await vendorsCol(db).findOne({ _id: vendorId, active: true })))
    return fail("Vendor not found or no longer active")

  const cleaned = cleanBill(input)
  if ("error" in cleaned) return cleaned

  if (await billsCol(db).findOne({ vendorId, billNumberLower: cleaned.fields.billNumberLower }))
    return fail("This bill number is already recorded for this vendor")

  const res = await billsCol(db).insertOne({
    ...cleaned.fields,
    vendorId,
    createdAt: new Date(),
    createdBy: actor.username,
  })
  return ok({ billId: res.insertedId.toString() })
}

async function paidOnBill(db: Db, billId: ObjectId, session?: ClientSession): Promise<number> {
  const rows = await paymentsCol(db)
    .aggregate(
      [
        { $match: { billId, voided: { $ne: true }, settlesVoucherId: null } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ],
      { session }
    )
    .toArray()
  return rows[0]?.total || 0
}

export async function updateBill(db: Db, id: string, input: BillInput) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Bill not found")
  const bill = await billsCol(db).findOne({ _id })
  if (!bill) return fail("Bill not found")

  const cleaned = cleanBill(input)
  if ("error" in cleaned) return cleaned

  const paid = await paidOnBill(db, _id)
  if ((cleaned.fields.amount as number) < paid - 0.004)
    return fail(`₹${paid.toFixed(2)} has already been paid on this bill, so it cannot be less than that`)

  const clash = await billsCol(db).findOne({
    vendorId: bill.vendorId,
    billNumberLower: cleaned.fields.billNumberLower,
    _id: { $ne: _id },
  })
  if (clash) return fail("This bill number is already recorded for this vendor")

  await billsCol(db).updateOne({ _id }, { $set: { ...cleaned.fields, updatedAt: new Date() } })
  return ok()
}

/** A bill can only be deleted if nothing was ever paid against it. */
export async function deleteBill(db: Db, id: string) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Bill not found")
  if (await paymentsCol(db).findOne({ billId: _id }))
    return fail("Payments exist for this bill, so it cannot be deleted")
  const res = await billsCol(db).deleteOne({ _id })
  return res.deletedCount ? ok() : fail("Bill not found")
}

/* ================= DAILY CASH SESSION ================= */

/** The purchase day for a date; created (carrying the last counted cash) if missing. */
export async function getOrCreateDay(db: Db, date: string, session?: ClientSession): Promise<Document> {
  const existing = await daysCol(db).findOne({ date }, { session })
  if (existing) return existing

  const prev = await daysCol(db).find({ date: { $lt: date } }, { session }).sort({ date: -1 }).limit(1).toArray()
  const carried: DenominationCount = {
    ...emptyDenoms(),
    ...((prev[0]?.nextDayOpeningDenominations ?? prev[0]?.closingDenominations) || {}),
  }
  const now = new Date()

  const created = await daysCol(db).findOneAndUpdate(
    { date },
    {
      $setOnInsert: {
        openingCash: calculateClosingCash(carried),
        openingDenominations: carried,
        cashIn: [],
        cashOut: [],
        closingDenominations: emptyDenoms(),
        status: "open",
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after", session }
  )
  return created as Document
}

async function dayPayments(db: Db, date: string): Promise<Document[]> {
  return paymentsCol(db).find({ date, voided: { $ne: true } }).sort({ createdAt: 1 }).toArray()
}

export function summarize(day: Document, payments: Document[]): DaySummary {
  const received = round2((day.cashIn || []).reduce((s: number, m: Document) => s + m.amount, 0))
  const sentOut = round2((day.cashOut || []).reduce((s: number, m: Document) => s + m.amount, 0))

  // only what the purchase counter itself paid comes out of its drawer (cash) or is its cheque / voucher
  const by = { cash: 0, cheque: 0, voucher: 0 }
  let admin = 0
  let counters = 0
  const vendors = new Set<string>()
  for (const p of payments) {
    const source: PaymentSource = p.source ?? "purchase"
    if (source === "admin") admin += p.amount
    else if (source === "counter") counters += p.amount
    else by[p.mode as PayMode] += p.amount
    vendors.add(String(p.vendorId))
  }

  const closing: DenominationCount = { ...emptyDenoms(), ...(day.closingDenominations || {}) }
  const counted = calculateClosingCash(closing)
  const keepDenoms = day.nextDayOpeningDenominations
    ? deriveKeep(closing, day.nextDayOpeningDenominations)
    : null
  const keep = keepDenoms ? calculateClosingCash(keepDenoms) : 0
  const expected = expectedPurchaseCash(day.openingCash || 0, received, sentOut, by.cash)
  return {
    opening: round2(day.openingCash || 0),
    received,
    sentOut,
    paidCash: round2(by.cash),
    expected,
    counted,
    shortage: round2(expected - counted),
    paidCheque: round2(by.cheque),
    paidVoucher: round2(by.voucher),
    paidByAdmin: round2(admin),
    paidByCounters: round2(counters),
    paidTotal: round2(by.cash + by.cheque + by.voucher + admin + counters),
    vendorsPaid: vendors.size,
    paymentCount: payments.length,
    keep: round2(keep),
    handover: round2(counted - keep),
  }
}

export interface DayPaymentRow extends PurchasePayment {
  vendorName: string
  billNumber?: string
}

export interface DayView {
  day: PurchaseDay
  summary: DaySummary
  payments: DayPaymentRow[]
  cheques: (Cheque & { vendorName: string })[]
  vouchers: (Voucher & { vendorName: string })[]
}

export async function getDayView(db: Db, date: string, create = false): Promise<DayView | null> {
  const dayDoc = create ? await getOrCreateDay(db, date) : await daysCol(db).findOne({ date })
  if (!dayDoc) return null

  const payDocs = await dayPayments(db, date)
  const [vendorDocs, billDocs, chequeDocs, voucherDocs] = await Promise.all([
    vendorsCol(db).find({}, { projection: { name: 1 } }).toArray(),
    billsCol(db)
      .find({ _id: { $in: payDocs.map((p) => p.billId).filter(Boolean) } }, { projection: { billNumber: 1 } })
      .toArray(),
    chequesCol(db).find({ issuedDate: date }).toArray(),
    vouchersCol(db).find({ issuedDate: date }).toArray(),
  ])
  const names = new Map(vendorDocs.map((v) => [String(v._id), v.name as string]))
  const billNo = new Map(billDocs.map((b) => [String(b._id), b.billNumber as string]))

  return {
    day: plain<PurchaseDay>(dayDoc),
    summary: summarize(dayDoc, payDocs),
    payments: payDocs.map((d) => {
      const p = plain<PurchasePayment>(d)
      return { ...p, vendorName: names.get(p.vendorId) ?? "—", billNumber: p.billId ? billNo.get(p.billId) : undefined }
    }),
    cheques: chequeDocs.map((d) => ({ ...plain<Cheque>(d), vendorName: names.get(String(d.vendorId)) ?? "—" })),
    vouchers: voucherDocs.map((d) => ({ ...plain<Voucher>(d), vendorName: names.get(String(d.vendorId)) ?? "—" })),
  }
}

/** Today's day must exist and still be open before money can be recorded. */
async function openToday(db: Db, session?: ClientSession): Promise<Document> {
  const day = await getOrCreateDay(db, todayIST(), session)
  if (day.status !== "open") stop("Today's purchase day is already submitted. Ask the admin to unlock it.")
  return day
}

/**
 * Saves the count and, optionally, how much of it stays for tomorrow.
 * What is kept can never be more than what was counted; the rest is handed to the admin.
 */
export async function updateClosing(db: Db, denominations: unknown, keep?: unknown) {
  const closing = cleanDenoms(denominations)
  if (!closing) return fail("Invalid denomination counts")

  let kept: DenominationCount | null = null
  if (keep !== undefined && keep !== null) {
    const clean = cleanDenoms(keep)
    if (!clean) return fail("Invalid denomination counts")
    kept = deriveKeep(closing, clean)
  }

  const day = await getOrCreateDay(db, todayIST())
  if (day.status !== "open") return fail("This day is already submitted")

  await daysCol(db).updateOne(
    { _id: day._id, status: "open" },
    {
      $set: {
        closingDenominations: closing,
        // if the count changed, a kept amount can never be more than what is there now
        ...(kept ? { nextDayOpeningDenominations: kept } : {}),
        updatedAt: new Date(),
      },
    }
  )
  return ok()
}

export async function submitDay(db: Db, actor: Actor, closedBy: unknown) {
  const who = await checkInCharge(db, closedBy)
  if (typeof who !== "string") return who

  const day = await getOrCreateDay(db, todayIST())
  if (day.status !== "open") return fail("This day is already submitted")

  if (!day.nextDayOpeningDenominations)
    return fail("Choose how much cash to keep for tomorrow (it can be nothing)")

  const closing: DenominationCount = { ...emptyDenoms(), ...(day.closingDenominations || {}) }
  const keep = deriveKeep(closing, day.nextDayOpeningDenominations)
  const handover = subtractDenoms(closing, keep)

  const summary = summarize(day, await dayPayments(db, day.date))
  const res = await daysCol(db).updateOne(
    { _id: day._id, status: "open" },
    {
      $unset: { handoverReceivedAt: "", handoverReceivedBy: "" },
      $set: {
        nextDayOpeningDenominations: keep,
        handoverDenominations: handover,
        handoverAmount: calculateClosingCash(handover),
        status: "submitted",
        closedBy: who,
        submittedBy: actor.username,
        submittedAt: new Date(),
        submittedExpectedCash: summary.expected,
        submittedActualCash: summary.counted,
        submittedShortage: summary.shortage,
        updatedAt: new Date(),
      },
    }
  )
  return res.matchedCount ? ok() : fail("This day is already submitted")
}

export async function confirmDay(db: Db, actor: Actor, date: unknown) {
  if (!isDateString(date)) return fail("Invalid date")
  const res = await daysCol(db).updateOne(
    { date, status: "submitted" },
    { $set: { status: "confirmed", confirmedAt: new Date(), confirmedBy: actor.username, updatedAt: new Date() } }
  )
  return res.matchedCount ? ok() : fail("Only a submitted day can be confirmed")
}

export async function unlockDay(db: Db, date: unknown) {
  if (!isDateString(date)) return fail("Invalid date")
  const res = await daysCol(db).updateOne(
    { date, status: { $in: ["submitted", "confirmed"] } },
    {
      $set: { status: "open", updatedAt: new Date() },
      $unset: {
        submittedAt: "",
        confirmedAt: "",
        confirmedBy: "",
        handoverReceivedAt: "",
        handoverReceivedBy: "",
      },
    }
  )
  return res.matchedCount ? ok() : fail("This day is already open")
}

/** The admin confirms the cash handed over at closing has been received. */
export async function acknowledgeHandover(db: Db, actor: Actor, date: unknown) {
  if (!isDateString(date)) return fail("Invalid date")
  const res = await daysCol(db).updateOne(
    { date, status: { $in: ["submitted", "confirmed"] }, handoverAmount: { $gt: 0 }, handoverReceivedAt: null },
    { $set: { handoverReceivedAt: new Date(), handoverReceivedBy: actor.username } }
  )
  return res.matchedCount ? ok() : fail("There is no handover waiting to be received")
}

/* ================= PAYMENTS ================= */

export interface PaymentInput {
  vendorId?: unknown
  billId?: unknown
  amount?: unknown
  mode?: unknown
  paidBy?: unknown
  note?: unknown
  cheque?: { number?: unknown; bank?: unknown; chequeDate?: unknown }
  voucher?: { number?: unknown; promisedDate?: unknown }
  /** a bill the vendor has just handed over: recorded together with this payment */
  newBill?: { billNumber?: unknown; billDate?: unknown; amount?: unknown; items?: unknown }
}

const MODES: PayMode[] = ["cash", "cheque", "voucher"]

/** What we still owe on bills (not counting vouchers) for one vendor. */
async function billsOutstanding(db: Db, vendorId: ObjectId, session?: ClientSession): Promise<number> {
  const vendor = await vendorsCol(db).findOne({ _id: vendorId }, { session })
  const [billed, paid] = await Promise.all([
    billsCol(db).aggregate([{ $match: { vendorId } }, { $group: { _id: null, t: { $sum: "$amount" } } }], { session }).toArray(),
    paymentsCol(db)
      .aggregate(
        [
          { $match: { vendorId, voided: { $ne: true }, settlesVoucherId: null } },
          { $group: { _id: null, t: { $sum: "$amount" } } },
        ],
        { session }
      )
      .toArray(),
  ])
  return round2((vendor?.openingBalance || 0) + (billed[0]?.t || 0) - (paid[0]?.t || 0))
}

function cleanCheque(c: PaymentInput["cheque"]): Failure | { number: string; bank: string; chequeDate: string } {
  const number = parseText(c?.number, 30)
  if (!number) return fail("Enter the cheque number")
  const bank = parseText(c?.bank, 60)
  if (!bank) return fail("Enter the bank")
  if (!isDateString(c?.chequeDate)) return fail("Enter the date on the cheque")
  return { number, bank, chequeDate: c!.chequeDate as string }
}

/** Who is making a payment, and where the money comes from. */
export interface Payer {
  source: PaymentSource
  /** a counter's name when a shop counter pays */
  sourceName?: string
  /** the person recorded as having paid */
  paidBy: string
}

interface PreparedPayment {
  vendorId: ObjectId
  billId: ObjectId | null
  mode: PayMode
  amount: number
  note?: string
  cheque: { number: string; bank: string; chequeDate: string } | null
  voucherNumber: string | null
  promisedDate?: string
}

/** Checks everything that can be checked without the database. */
function preparePayment(input: PaymentInput, onlyModes: PayMode[] = MODES): Failure | PreparedPayment {
  const vendorId = parseObjectId(input.vendorId)
  if (!vendorId) return fail("Choose a vendor")
  const mode = input.mode as PayMode
  if (!onlyModes.includes(mode)) return fail("Choose how it is being paid")
  const amount = parseMoney(input.amount, { min: 0.01 })
  if (amount === null) return fail("Enter a valid amount")
  if (isBad(input.note, 300)) return fail("Note is too long")

  let billId: ObjectId | null = null
  if (input.billId) {
    billId = parseObjectId(input.billId)
    if (!billId) return fail("Bill not found")
  }

  let cheque: PreparedPayment["cheque"] = null
  let voucherNumber: string | null = null
  let promisedDate: string | undefined
  if (mode === "cheque") {
    const c = cleanCheque(input.cheque)
    if ("error" in c) return c
    cheque = c
  }
  if (mode === "voucher") {
    voucherNumber = parseText(input.voucher?.number, 30)
    if (!voucherNumber) return fail("Enter the voucher number")
    const pd = input.voucher?.promisedDate
    if (pd !== undefined && pd !== "" && !isDateString(pd)) return fail("Promised date is not valid")
    promisedDate = pd ? (pd as string) : undefined
  }

  return { vendorId, billId, mode, amount, note: optionalText(input.note, 300), cheque, voucherNumber, promisedDate }
}

/**
 * Writes one payment (and its cheque or voucher) inside an open transaction.
 * Refuses to pay more than is owed. Returns what the callers need to describe it.
 */
async function applyPayment(
  db: Db,
  session: ClientSession,
  p: PreparedPayment,
  payer: Payer,
  date: string,
  paymentId = new ObjectId()
) {
  const vendor = await vendorsCol(db).findOne({ _id: p.vendorId, active: true }, { session })
  if (!vendor) stop("Vendor not found or no longer active")

  let billNumber: string | undefined
  if (p.billId) {
    const bill = await billsCol(db).findOne({ _id: p.billId, vendorId: p.vendorId }, { session })
    if (!bill) stop("Bill not found for this vendor")
    const paid = await paidOnBill(db, p.billId, session)
    if (p.amount > round2(bill!.amount - paid) + 0.004)
      stop(`Only ₹${round2(bill!.amount - paid).toFixed(2)} is left on this bill`)
    billNumber = bill!.billNumber as string
  } else {
    const owed = await billsOutstanding(db, p.vendorId, session)
    if (p.amount > owed + 0.004) stop(`This vendor is only owed ₹${Math.max(owed, 0).toFixed(2)} on bills`)
  }

  const cheque = p.cheque ? { ...p.cheque } : null
  if (cheque) {
    cheque.bank = await resolveBank(db, cheque.bank, session)
    const dup = await chequesCol(db).findOne(
      { numberLower: cheque.number.toLowerCase(), bankLower: cheque.bank.toLowerCase(), status: { $ne: "cancelled" } },
      { session }
    )
    if (dup) stop("This cheque number is already recorded for that bank")
  }
  if (p.voucherNumber) {
    if (await vouchersCol(db).findOne({ numberLower: p.voucherNumber.toLowerCase() }, { session }))
      stop("This voucher number is already used")
  }

  const now = new Date()
  const chequeId = cheque ? new ObjectId() : undefined
  const voucherId = p.voucherNumber ? new ObjectId() : undefined

  await paymentsCol(db).insertOne(
    {
      _id: paymentId,
      vendorId: p.vendorId,
      billId: p.billId,
      date,
      amount: p.amount,
      mode: p.mode,
      reference: cheque?.number ?? p.voucherNumber ?? undefined,
      chequeId,
      voucherId,
      settlesVoucherId: null,
      source: payer.source,
      sourceName: payer.sourceName,
      note: p.note,
      paidBy: payer.paidBy,
      voided: false,
      createdAt: now,
      createdBy: payer.paidBy,
    },
    { session }
  )

  if (cheque && chequeId) {
    await chequesCol(db).insertOne(
      {
        _id: chequeId,
        vendorId: p.vendorId,
        billId: p.billId,
        number: cheque.number,
        numberLower: cheque.number.toLowerCase(),
        bank: cheque.bank,
        bankLower: cheque.bank.toLowerCase(),
        chequeDate: cheque.chequeDate,
        amount: p.amount,
        status: "issued",
        issuedDate: date,
        paymentId,
        createdAt: now,
      },
      { session }
    )
  }
  if (p.voucherNumber && voucherId) {
    await vouchersCol(db).insertOne(
      {
        _id: voucherId,
        vendorId: p.vendorId,
        billId: p.billId,
        number: p.voucherNumber,
        numberLower: p.voucherNumber.toLowerCase(),
        amount: p.amount,
        issuedDate: date,
        promisedDate: p.promisedDate,
        status: "pending",
        paymentId,
        createdAt: now,
      },
      { session }
    )
  }

  return { paymentId, vendorName: vendor!.name as string, billNumber }
}

const PURCHASE_PAYER = (paidBy: string): Payer => ({ source: "purchase", paidBy })

/**
 * The purchase counter or the admin pays a vendor.
 *  - purchase: paid from the purchase drawer, needs today's purchase day to be open,
 *    and the person handling it is chosen from the in-charges
 *  - admin: paid from the admin's own money, never touches the purchase drawer
 */
export async function recordPayment(db: Db, actor: Actor, input: PaymentInput, as: "purchase" | "admin" = "purchase") {
  // paying against a brand-new bill: the bill is recorded in the same step
  let newBill: { fields: Document } | null = null
  if (input.newBill) {
    if (input.billId) return fail("Choose either an existing bill or a new bill")
    const cleaned = cleanBill({ ...input.newBill, billDate: input.newBill.billDate || todayIST() })
    if ("error" in cleaned) return cleaned
    newBill = cleaned
  }

  const prepared = preparePayment(input)
  if ("error" in prepared) return prepared
  if (newBill && prepared.amount > (newBill.fields.amount as number) + 0.004)
    return fail("You cannot pay more than the bill amount")

  let payer: Payer
  if (as === "admin") {
    payer = { source: "admin", paidBy: actor.username }
  } else {
    const who = await checkInCharge(db, input.paidBy)
    if (typeof who !== "string") return who
    payer = PURCHASE_PAYER(who)
  }

  return atomic(db, async (session) => {
    const date = as === "purchase" ? (await openToday(db, session)).date : todayIST()
    let toPay = prepared
    if (newBill) {
      if (!(await vendorsCol(db).findOne({ _id: prepared.vendorId, active: true }, { session })))
        stop("Vendor not found or no longer active")
      if (await billsCol(db).findOne({ vendorId: prepared.vendorId, billNumberLower: newBill.fields.billNumberLower }, { session }))
        stop("This bill number is already recorded for this vendor")
      const billId = new ObjectId()
      await billsCol(db).insertOne(
        { _id: billId, vendorId: prepared.vendorId, ...newBill.fields, createdAt: new Date(), createdBy: payer.paidBy },
        { session }
      )
      toPay = { ...prepared, billId }
    }
    const done = await applyPayment(db, session, toPay, payer, date)
    return ok({ paymentId: done.paymentId.toString() })
  })
}

/* ---------- a shop counter pays a vendor for a NEW bill, in cash ---------- */

export interface CounterActor {
  counterName: string
  username: string
}

const entriesDocs = (db: Db) => db.collection("entries")

export interface CounterBillPaymentInput {
  vendorId?: unknown
  /** the new bill the vendor has just handed over */
  billNumber?: unknown
  billDate?: unknown
  billAmount?: unknown
  items?: unknown
  /** how much is being paid now (can be less than the bill) */
  amount?: unknown
  note?: unknown
  mode?: unknown
}

/**
 * A shop counter receives a NEW bill from a vendor and pays some or all of it in cash.
 * Everything below happens together or not at all:
 *  - the bill is recorded against the vendor
 *  - the payment is recorded against that bill (so the vendor's balance is right)
 *  - the counter's page gets a locked "Money out" line (so its cash stays right)
 */
export async function recordCounterVendorPayment(db: Db, counter: CounterActor, input: CounterBillPaymentInput) {
  // a counter pays in cash only; anything else is refused, never quietly changed
  if (input.mode !== undefined && input.mode !== "cash") return fail("A counter can only pay vendors in cash")

  const vendorId = parseObjectId(input.vendorId)
  if (!vendorId) return fail("Choose a vendor")

  const date = todayIST()
  const bill = cleanBill({
    billNumber: input.billNumber,
    billDate: input.billDate || date,
    amount: input.billAmount,
    items: input.items,
  })
  if ("error" in bill) return bill

  const paid = parseMoney(input.amount, { min: 0.01 })
  if (paid === null) return fail("Enter how much you are paying now")
  if (paid > (bill.fields.amount as number) + 0.004) return fail("You cannot pay more than the bill amount")
  if (isBad(input.note, 300)) return fail("Note is too long")

  return atomic(db, async (session) => {
    const entry = await entriesDocs(db).findOne(
      { counterName: counter.counterName, date, status: "open", openingVerified: true },
      { session }
    )
    if (!entry) stop("Your day must be open and the opening cash verified before paying a vendor")

    if (!(await vendorsCol(db).findOne({ _id: vendorId, active: true }, { session })))
      stop("Vendor not found or no longer active")
    if (await billsCol(db).findOne({ vendorId, billNumberLower: bill.fields.billNumberLower }, { session }))
      stop("This bill number is already recorded for this vendor. If it was entered earlier, ask the purchase counter.")

    const billId = new ObjectId()
    const paymentId = new ObjectId()

    await billsCol(db).insertOne(
      {
        _id: billId,
        vendorId,
        ...bill.fields,
        createdAt: new Date(),
        createdBy: counter.counterName,
        // remembered so the bill can be removed again if this payment is cancelled
        enteredWithPaymentId: paymentId,
      },
      { session }
    )

    const done = await applyPayment(
      db,
      session,
      { vendorId, billId, mode: "cash", amount: paid, note: optionalText(input.note, 300), cheque: null, voucherNumber: null },
      { source: "counter", sourceName: counter.counterName, paidBy: counter.counterName },
      date,
      paymentId
    )

    const line = {
      description: `Vendor: ${done.vendorName} (bill ${done.billNumber})`,
      amount: paid,
      type: "OUT",
      time: new Date().toISOString(),
      vendorPaymentId: paymentId.toString(),
    }
    await entriesDocs(db).updateOne(
      { _id: entry!._id, status: "open" },
      { $push: { payments: line } as any, $set: { updatedAt: new Date() } },
      { session }
    )

    return ok({ payments: plain<Document[]>([...(entry!.payments || []), line] as any), billId: billId.toString() })
  })
}

/**
 * A counter cancels a vendor payment it made today (while its day is still open).
 * If the bill was entered together with this payment and nothing else was paid on
 * it, the bill is removed too.
 */
export async function cancelCounterVendorPayment(db: Db, counter: CounterActor, vendorPaymentId: unknown) {
  const _id = parseObjectId(vendorPaymentId)
  if (!_id) return fail("Payment not found")
  const key = String(_id)

  return atomic(db, async (session) => {
    const entry = await entriesDocs(db).findOne(
      { counterName: counter.counterName, status: "open", "payments.vendorPaymentId": key },
      { session }
    )
    if (!entry) stop("This payment can no longer be cancelled. Ask the admin.")

    const payment = await paymentsCol(db).findOne(
      { _id, source: "counter", sourceName: counter.counterName, voided: { $ne: true } },
      { session }
    )
    if (!payment) stop("Payment not found")

    await voidPayment(db, payment!, session)

    if (payment!.billId) {
      const bill = await billsCol(db).findOne({ _id: payment!.billId, enteredWithPaymentId: _id }, { session })
      const others = await paymentsCol(db).findOne(
        { billId: payment!.billId, _id: { $ne: _id }, voided: { $ne: true } },
        { session }
      )
      if (bill && !others) await billsCol(db).deleteOne({ _id: bill._id }, { session })
    }

    const remaining = (entry!.payments || []).filter((x: Document) => x.vendorPaymentId !== key)
    await entriesDocs(db).updateOne(
      { _id: entry!._id, status: "open" },
      { $set: { payments: remaining, updatedAt: new Date() } },
      { session }
    )
    return ok({ payments: plain<Document[]>(remaining as any) })
  })
}

/** The vendors a counter can pay (any active vendor, since the bill is new). */
export interface CounterVendor {
  _id: string
  name: string
  items?: string
}

export async function listCounterVendors(db: Db): Promise<CounterVendor[]> {
  const docs = await vendorsCol(db).find({ active: true }).sort({ nameLower: 1 }).toArray()
  return docs.map((d) => ({ _id: String(d._id), name: d.name as string, items: d.items as string | undefined }))
}

/** Pays an earlier voucher with cash or a cheque. */
export async function settleVoucher(
  db: Db,
  actor: Actor,
  input: { voucherId?: unknown; mode?: unknown; paidBy?: unknown; note?: unknown; cheque?: PaymentInput["cheque"] },
  as: "purchase" | "admin" = "purchase"
) {
  const voucherId = parseObjectId(input.voucherId)
  if (!voucherId) return fail("Voucher not found")
  if (input.mode !== "cash" && input.mode !== "cheque") return fail("Settle a voucher with cash or a cheque")
  const mode = input.mode as "cash" | "cheque"
  if (isBad(input.note, 300)) return fail("Note is too long")

  let who: string
  if (as === "admin") who = actor.username
  else {
    const checked = await checkInCharge(db, input.paidBy)
    if (typeof checked !== "string") return checked
    who = checked
  }

  let cheque: { number: string; bank: string; chequeDate: string } | null = null
  if (mode === "cheque") {
    const c = cleanCheque(input.cheque)
    if ("error" in c) return c
    cheque = c
  }

  return atomic(db, async (session) => {
    const day = as === "purchase" ? await openToday(db, session) : { date: todayIST() }
    const voucher = await vouchersCol(db).findOne({ _id: voucherId, status: "pending" }, { session })
    if (!voucher) stop("This voucher is not waiting to be settled")

    if (cheque) {
      cheque.bank = await resolveBank(db, cheque.bank, session)
      const dup = await chequesCol(db).findOne(
        { numberLower: cheque.number.toLowerCase(), bankLower: cheque.bank.toLowerCase(), status: { $ne: "cancelled" } },
        { session }
      )
      if (dup) stop("This cheque number is already recorded for that bank")
    }

    const paymentId = new ObjectId()
    const chequeId = cheque ? new ObjectId() : undefined
    const now = new Date()

    await paymentsCol(db).insertOne(
      {
        _id: paymentId,
        vendorId: voucher!.vendorId,
        billId: null,
        date: day.date,
        amount: voucher!.amount,
        mode,
        reference: cheque?.number,
        chequeId,
        settlesVoucherId: voucherId,
        source: as === "admin" ? "admin" : "purchase",
        note: optionalText(input.note, 300) ?? `Settles voucher ${voucher!.number}`,
        paidBy: who,
        voided: false,
        createdAt: now,
        createdBy: actor.username,
      },
      { session }
    )
    if (cheque && chequeId) {
      await chequesCol(db).insertOne(
        {
          _id: chequeId,
          vendorId: voucher!.vendorId,
          billId: null,
          number: cheque.number,
          numberLower: cheque.number.toLowerCase(),
          bank: cheque.bank,
          bankLower: cheque.bank.toLowerCase(),
          chequeDate: cheque.chequeDate,
          amount: voucher!.amount,
          status: "issued",
          issuedDate: day.date,
          paymentId,
          createdAt: now,
        },
        { session }
      )
    }
    await vouchersCol(db).updateOne(
      { _id: voucherId },
      { $set: { status: "settled", settledAt: now, settledPaymentId: paymentId } },
      { session }
    )
    return ok({ paymentId: paymentId.toString() })
  })
}

/** Puts a payment's effect back: a settled voucher becomes pending again. */
async function voidPayment(db: Db, payment: Document, session: ClientSession) {
  await paymentsCol(db).updateOne({ _id: payment._id }, { $set: { voided: true, voidedAt: new Date() } }, { session })
  if (payment.settlesVoucherId) {
    await vouchersCol(db).updateOne(
      { _id: payment.settlesVoucherId, status: "settled" },
      { $set: { status: "pending" }, $unset: { settledAt: "", settledPaymentId: "" } },
      { session }
    )
  }
}

/**
 * A cash payment made by mistake today can be cancelled.
 *  - the purchase counter can cancel its own, while today's purchase day is open
 *  - the admin can cancel the admin's own
 *  - a counter's vendor payment is cancelled from that counter's page
 */
export async function cancelCashPayment(db: Db, paymentId: unknown, as: "purchase" | "admin" = "purchase") {
  const _id = parseObjectId(paymentId)
  if (!_id) return fail("Payment not found")

  return atomic(db, async (session) => {
    const payment = await paymentsCol(db).findOne({ _id, mode: "cash", voided: { $ne: true } }, { session })
    if (!payment) stop("Payment not found")
    const source: PaymentSource = payment!.source ?? "purchase"

    if (source === "counter") stop("A counter's payment is cancelled from that counter's Payments page")
    if (as === "purchase") {
      if (source !== "purchase") stop("Only the admin can cancel the admin's payments")
      const day = await openToday(db, session)
      if (payment!.date !== day.date) stop("Only today's cash payments can be cancelled")
    } else {
      if (source !== "admin") stop("This payment was made by the purchase counter")
      if (payment!.date !== todayIST()) stop("Only today's payments can be cancelled")
    }
    await voidPayment(db, payment!, session)
    return ok()
  })
}

/* ================= OTHER CASH MOVEMENTS ================= */

/**
 * Cash handed straight to the purchase staff (no portal transfer), counted note by note.
 * It can happen several times a day.
 */
export async function recordCashReceived(
  db: Db,
  input: { from?: unknown; denominations?: unknown; note?: unknown; receivedBy?: unknown }
) {
  const denoms = cleanDenoms(input.denominations)
  if (!denoms) return fail("Invalid denomination counts")
  const amount = calculateClosingCash(denoms)
  if (amount <= 0) return fail("Enter the notes and coins that were received")
  const by = await checkInCharge(db, input.receivedBy)
  if (typeof by !== "string") return by
  if (isBad(input.from, 60) || isBad(input.note, 200)) return fail("That text is too long")

  return atomic(db, async (session) => {
    const day = await openToday(db, session)
    await daysCol(db).updateOne(
      { _id: day._id, status: "open" },
      {
        $push: {
          cashIn: {
            id: new ObjectId().toString(),
            kind: "received",
            party: optionalText(input.from, 60) ?? "Admin",
            amount,
            denominations: denoms,
            by,
            time: new Date().toISOString(),
            note: optionalText(input.note, 200),
          },
        } as any,
        $set: { updatedAt: new Date() },
      },
      { session }
    )
    return ok({ amount })
  })
}

/**
 * Any other money in or out of the purchase drawer (not a vendor payment), with the reason.
 * Same idea as "Money in / Money out" on the shop counters.
 */
export async function recordMoneyMove(
  db: Db,
  direction: "in" | "out",
  input: { amount?: unknown; reason?: unknown; by?: unknown }
) {
  if (direction !== "in" && direction !== "out") return fail("Invalid entry")
  const amount = parseMoney(input.amount)
  if (amount === null || amount <= 0) return fail("Enter a valid amount")
  const reason = parseText(input.reason, 120)
  if (!reason) return fail(direction === "in" ? "Say where this money came from" : "Say what this money was paid for")
  const by = await checkInCharge(db, input.by)
  if (typeof by !== "string") return by

  return atomic(db, async (session) => {
    const day = await openToday(db, session)
    const move = {
      id: new ObjectId().toString(),
      kind: direction === "in" ? "other-in" : "other-out",
      party: reason,
      amount,
      by,
      time: new Date().toISOString(),
    }
    await daysCol(db).updateOne(
      { _id: day._id, status: "open" },
      { $push: { [direction === "in" ? "cashIn" : "cashOut"]: move } as any, $set: { updatedAt: new Date() } },
      { session }
    )
    return ok()
  })
}

/** Removes one of today's own entries (cash received, other money in/out). Transfers are cancelled from the transfer card. */
export async function cancelCashMove(db: Db, moveId: unknown) {
  const id = parseText(moveId, 40)
  if (!id) return fail("Entry not found")

  return atomic(db, async (session) => {
    const day = await openToday(db, session)
    for (const field of ["cashIn", "cashOut"] as const) {
      const found = (day[field] || []).find((m: Document) => m.id === id)
      if (!found) continue
      if (found.transferId || !found.kind) stop("This came from a cash transfer. Cancel it from the transfer card")
      await daysCol(db).updateOne(
        { _id: day._id, status: "open" },
        { $pull: { [field]: { id } } as any, $set: { updatedAt: new Date() } },
        { session }
      )
      return ok()
    }
    return stop("Entry not found")
  })
}

/* ================= BANKS ================= */

/**
 * The banks cheques can be drawn on. Banks already used on existing cheques are
 * added automatically, so nothing typed in the past is lost.
 */
export async function listBanks(db: Db): Promise<Bank[]> {
  const used: string[] = await chequesCol(db).distinct("bank")
  for (const name of used) {
    const clean = parseText(name, 60)
    if (clean) {
      await banksCol(db).updateOne(
        { nameLower: clean.toLowerCase() },
        { $setOnInsert: { name: clean, nameLower: clean.toLowerCase(), active: true, createdAt: new Date(), createdBy: "existing cheques" } },
        { upsert: true }
      )
    }
  }
  const docs = await banksCol(db).find({}).sort({ nameLower: 1 }).toArray()
  return docs.map((d) => plain<Bank>(d))
}

export async function addBank(db: Db, actor: Actor, name: unknown) {
  const clean = parseText(name, 60)
  if (!clean) return fail("Enter the bank's name")

  const existing = await banksCol(db).findOne({ nameLower: clean.toLowerCase() })
  if (existing) {
    if (existing.active) return fail("This bank is already in the list")
    await banksCol(db).updateOne({ _id: existing._id }, { $set: { active: true } })
    return ok({ bankId: String(existing._id) })
  }
  const res = await banksCol(db).insertOne({
    name: clean,
    nameLower: clean.toLowerCase(),
    active: true,
    createdAt: new Date(),
    createdBy: actor.username,
  })
  return ok({ bankId: res.insertedId.toString() })
}

/** Removed banks are only hidden, so old cheques keep their bank name. */
export async function setBankActive(db: Db, id: unknown, active: boolean) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Bank not found")
  await banksCol(db).updateOne({ _id }, { $set: { active: !!active } })
  return ok()
}

/** A bank typed on a cheque must be one from the list; returns its proper name. */
async function resolveBank(db: Db, name: string, session?: ClientSession): Promise<string> {
  const bank = await banksCol(db).findOne({ nameLower: name.toLowerCase(), active: true }, { session })
  if (!bank) stop("Choose a bank from the list (add it first if it is new)")
  return bank!.name as string
}

/* ================= CHEQUES ================= */

export async function setChequeStatus(db: Db, id: unknown, status: unknown) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Cheque not found")
  if (status !== "cleared" && status !== "bounced" && status !== "cancelled") return fail("Invalid status")

  return atomic(db, async (session) => {
    const cheque = await chequesCol(db).findOne({ _id, status: "issued" }, { session })
    if (!cheque) stop("Only an issued cheque can be changed")

    await chequesCol(db).updateOne(
      { _id },
      { $set: { status, statusChangedAt: new Date(), ...(status === "cleared" ? { clearedAt: new Date() } : {}) } },
      { session }
    )

    // a cheque that did not go through was never a payment
    if (status === "bounced" || status === "cancelled") {
      const payment = await paymentsCol(db).findOne({ _id: cheque!.paymentId }, { session })
      if (payment && !payment.voided) await voidPayment(db, payment, session)
    }
    return ok()
  })
}

export interface ChequeRow extends Cheque {
  vendorName: string
  /** the bill the cheque was given for, if any */
  billNumber?: string
  /** who handled it */
  paidBy?: string
}

export async function listCheques(db: Db): Promise<ChequeRow[]> {
  const docs = await chequesCol(db).find({}).sort({ chequeDate: 1 }).toArray()
  const [vendors, payments, bills] = await Promise.all([
    vendorsCol(db).find({}, { projection: { name: 1 } }).toArray(),
    paymentsCol(db).find({ _id: { $in: docs.map((d) => d.paymentId) } }, { projection: { paidBy: 1 } }).toArray(),
    billsCol(db)
      .find({ _id: { $in: docs.map((d) => d.billId).filter(Boolean) } }, { projection: { billNumber: 1 } })
      .toArray(),
  ])
  const names = new Map(vendors.map((v) => [String(v._id), v.name as string]))
  const paidBy = new Map(payments.map((p) => [String(p._id), p.paidBy as string]))
  const billNo = new Map(bills.map((b) => [String(b._id), b.billNumber as string]))

  return docs.map((d) => ({
    ...plain<Cheque>(d),
    vendorName: names.get(String(d.vendorId)) ?? "—",
    billNumber: d.billId ? billNo.get(String(d.billId)) : undefined,
    paidBy: paidBy.get(String(d.paymentId)),
  }))
}

/* ================= VOUCHERS ================= */

export async function cancelVoucher(db: Db, id: unknown) {
  const _id = parseObjectId(id)
  if (!_id) return fail("Voucher not found")

  return atomic(db, async (session) => {
    const voucher = await vouchersCol(db).findOne({ _id, status: "pending" }, { session })
    if (!voucher) stop("Only a pending voucher can be cancelled")

    await vouchersCol(db).updateOne({ _id }, { $set: { status: "cancelled", cancelledAt: new Date() } }, { session })
    const payment = await paymentsCol(db).findOne({ _id: voucher!.paymentId }, { session })
    if (payment && !payment.voided) await voidPayment(db, payment, session)
    return ok()
  })
}

export interface VoucherRow extends Voucher {
  vendorName: string
}

export async function listVouchers(db: Db): Promise<VoucherRow[]> {
  const [docs, vendors] = await Promise.all([
    vouchersCol(db).find({}).sort({ issuedDate: -1 }).toArray(),
    vendorsCol(db).find({}, { projection: { name: 1 } }).toArray(),
  ])
  const names = new Map(vendors.map((v) => [String(v._id), v.name as string]))
  return docs.map((d) => ({ ...plain<Voucher>(d), vendorName: names.get(String(d.vendorId)) ?? "—" }))
}

/* ================= REPORTS ================= */

export interface DayReportRow {
  date: string
  received: number
  sentOut: number
  paidCash: number
  paidCheque: number
  paidVoucher: number
  paidAdmin: number
  paidCounters: number
  paidTotal: number
  vendorsPaid: number
  status: string
  shortage: number | null
}

/** One row per day in the range: cash given, paid by each mode, vendors paid. */
export async function getDayReport(db: Db, start: string, end: string): Promise<DayReportRow[]> {
  if (!isDateString(start) || !isDateString(end) || start > end) return []
  const [days, payments] = await Promise.all([
    daysCol(db).find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }).toArray(),
    paymentsCol(db).find({ date: { $gte: start, $lte: end }, voided: { $ne: true } }).toArray(),
  ])

  const byDate = new Map<string, Document[]>()
  for (const p of payments) byDate.set(p.date, [...(byDate.get(p.date) || []), p])

  const dates = new Set<string>([...days.map((d) => d.date as string), ...byDate.keys()])
  return [...dates].sort().map((date) => {
    const day = days.find((d) => d.date === date)
    const s = summarize(day ?? { openingCash: 0, cashIn: [], cashOut: [], closingDenominations: {} }, byDate.get(date) || [])
    return {
      date,
      received: s.received,
      sentOut: s.sentOut,
      paidCash: s.paidCash,
      paidCheque: s.paidCheque,
      paidVoucher: s.paidVoucher,
      paidAdmin: s.paidByAdmin,
      paidCounters: s.paidByCounters,
      paidTotal: s.paidTotal,
      vendorsPaid: s.vendorsPaid,
      status: day?.status ?? "open",
      shortage: day && day.status !== "open" ? s.shortage : null,
    }
  })
}
