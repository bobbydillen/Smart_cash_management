// Fills the last few days with realistic DEMO entries for the four shop counters and the
// purchase counter, and closes them, so the app can be shown end to end.
//
//  - the three earlier days are submitted AND confirmed by the admin
//  - today is submitted and waits for the admin's confirmation
//  - tomorrow is left untouched, so each counter starts with the opening-cash verification
//
// Works on a TEST database only (refuses the live one). Entries that are already submitted or
// confirmed are never changed, and anything already typed into an open entry (payments,
// transfers, an opening check) is kept.
//
// Run:  node --env-file=.env.local scripts/seed-demo-days.mjs [days]     (default 4 = today and 3 before)
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(pathToFileURL(root + path.sep))
const ts = require("typescript")

const dbName = process.env.MONGODB_DB || "smartmart_cash"
if (!process.env.MONGODB_URI) {
  console.error("Set MONGODB_URI in .env.local")
  process.exit(1)
}
if (dbName === "smartmart_cash") {
  console.error("Refusing to add demo data to the live database.")
  process.exit(1)
}

const out = path.join(root, ".scratch-test")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out)
for (const f of ["purchase-service", "purchase", "entries", "next-day", "types", "action-result", "validation", "report", "incharge-group", "text-format"]) {
  let js = ts.transpileModule(fs.readFileSync(path.join(root, "lib", f + ".ts"), "utf8"), {
    compilerOptions: { module: "ESNext", target: "ES2022" },
  }).outputText
  js = js.replace(/from "(\.\/[a-z-]+)"/g, 'from "$1.mjs"')
  fs.writeFileSync(path.join(out, f + ".mjs"), js)
}
const url = (p) => pathToFileURL(path.join(root, p)).href
const { MongoClient, ObjectId } = await import(url("node_modules/mongodb/lib/index.js"))
const S = await import(url(".scratch-test/purchase-service.mjs"))
const { todayIST, addDays } = await import(url(".scratch-test/report.mjs"))
const { allocateNotes, emptyDenoms, subtractDenoms, NOTE_KEYS, COIN_KEYS } = await import(url(".scratch-test/next-day.mjs"))
const { calculateClosingCash } = await import(url(".scratch-test/types.mjs"))

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db(dbName)
const entries = db.collection("entries")
const today = todayIST()
const DAYS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 4
const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)))
const now = Date.now()

/* ---------------- helpers ---------------- */

function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
const pick = (r, list) => list[Math.floor(r() * list.length)]

/** a moment on a date (IST); never in the future for today */
const at = (date, hh, mm = 0) => {
  const d = new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`)
  return d.getTime() > now ? new Date(now - 60_000 * (5 + (hh % 7))) : d
}

/** a believable note / coin breakdown that adds up to exactly `total` */
function breakdown(total, r, style = "counter") {
  const d = emptyDenoms()
  if (style === "counter") {
    d.coins10 = between(r, 18, 45)
    d.coins5 = between(r, 15, 40)
    d.coins2 = between(r, 10, 30)
    d.notes10 = between(r, 60, 160)
    d.notes20 = between(r, 40, 90)
    d.notes50 = between(r, 20, 45)
  } else {
    d.notes50 = between(r, 4, 20)
    d.notes20 = between(r, 0, 10)
  }
  const small = () => d.coins10 * 10 + d.coins5 * 5 + d.coins2 * 2 + d.notes10 * 10 + d.notes20 * 20 + d.notes50 * 50
  while (small() > total * 0.35) {
    d.notes10 = Math.floor(d.notes10 / 2)
    d.notes20 = Math.floor(d.notes20 / 2)
    d.coins10 = Math.floor(d.coins10 / 2)
    d.notes50 = Math.floor(d.notes50 / 2)
    if (small() === 0) break
  }
  let rem = total - small()
  d.notes500 = Math.floor((rem * (style === "counter" ? 0.55 : 0.8)) / 500)
  rem -= d.notes500 * 500
  d.notes200 = Math.floor((rem * 0.2) / 200)
  rem -= d.notes200 * 200
  d.notes100 = Math.floor(rem / 100)
  rem -= d.notes100 * 100
  d.notes50 += Math.floor(rem / 50)
  rem %= 50
  d.notes20 += Math.floor(rem / 20)
  rem %= 20
  d.notes10 += Math.floor(rem / 10)
  rem %= 10
  d.coins5 += Math.floor(rem / 5)
  rem %= 5
  d.coins2 += Math.floor(rem / 2)
  rem %= 2
  d.coins1 = rem + between(r, 20, 60) * 0 // the last rupees
  if (calculateClosingCash(d) !== total) throw new Error("breakdown does not add up")
  return d
}

const keysOf = (d) => Object.keys(d).filter((k) => d[k] > 0).map((k) => `${k}:${d[k]}`)
const sub = (a, b) => subtractDenoms(a, b)

/* ---------------- shop counters ---------------- */

const COUNTERS = [
  { name: "Smart Mart Counter 1", code: "M1", sales: [92000, 125000], fashion: false },
  { name: "Smart Mart Counter 2", code: "M2", sales: [60000, 90000], fashion: false },
  { name: "Smart Mart Fancy", code: "MF", sales: [18000, 35000], fashion: false },
  { name: "Smart Fashion (Both)", code: "FB", sales: [0, 0], fashion: true },
]
const OUT_REASONS = [
  ["Tea & snacks for staff", 150, 450],
  ["Courier / parcel charges", 200, 900],
  ["Auto & transport", 120, 600],
  ["Packing covers & tape", 300, 1200],
  ["Drinking water cans", 100, 300],
  ["Cleaning & housekeeping", 200, 700],
  ["Staff advance", 1000, 3000],
  ["Mobile recharge", 199, 399],
  ["Stationery", 150, 500],
]
const IN_REASONS = [
  ["Cash from owner for change", 2000, 5000],
  ["Old customer bill received", 500, 2500],
]

const incharges = (await db.collection("incharges").find({ active: true, group: { $ne: "purchase" } }).toArray()).map((i) => i.name)
if (incharges.length === 0) throw new Error("No counter in-charges exist. Add some under Admin > In-charges first.")
const purchaseStaff = (await db.collection("incharges").find({ active: true, group: "purchase" }).toArray()).map((i) => i.name)
if (purchaseStaff.length === 0) throw new Error("No purchase staff exist. Add some under Admin > In-charges > Purchase staff first.")

const log = []
const isToday = (d) => d === today

async function previousClosed(counterName, date) {
  const latest = await entries.find({ counterName, date: { $lt: date } }).sort({ date: -1 }).limit(1).toArray()
  if (!latest.length) return null
  const same = await entries.find({ counterName, date: latest[0].date }).toArray()
  const rank = { confirmed: 3, submitted: 2, open: 1 }
  const best = same.sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0))[0]
  return best.status === "open" ? null : best
}

async function ensureEntry(c, date) {
  let e = await entries.findOne({ counterName: c.name, date })
  if (e) return e
  const prev = await previousClosed(c.name, date)
  const denominations = { ...emptyDenoms(), ...(prev?.nextDayOpeningDenominations || {}) }
  await entries.insertOne({
    counterName: c.name,
    date,
    openingCash: calculateClosingCash(denominations),
    openingDenominations: denominations,
    openingVerified: false,
    openingVerifiedAt: null,
    payments: [],
    sales: { totalSales: 0, cardUpiSales: 0, creditSales: 0 },
    closingDenominations: emptyDenoms(),
    status: "open",
    createdAt: at(date, 8, 55),
    updatedAt: at(date, 8, 55),
  })
  return entries.findOne({ counterName: c.name, date })
}

async function fillCounterDay(c, date) {
  let e = await ensureEntry(c, date)
  if (e.status !== "open") {
    log.push(`skip   ${date} ${c.name} (already ${e.status})`)
    return
  }
  const r = rng(c.name + date)

  // opening: keep an existing check, otherwise carry from the last closed day and verify it
  const prev = await previousClosed(c.name, date)
  if (!e.openingVerified) {
    const denominations = { ...emptyDenoms(), ...(prev?.nextDayOpeningDenominations || e.openingDenominations || {}) }
    await entries.updateOne(
      { _id: e._id },
      {
        $set: {
          openingCash: calculateClosingCash(denominations),
          openingDenominations: denominations,
          openingVerified: true,
          openingVerifyStatus: "verified",
          openingVerifiedBy: pick(r, incharges),
          openingVerifiedAt: at(date, 9, between(r, 2, 25)),
          openingCheckedDenoms: keysOf(denominations).map((k) => k.split(":")[0]),
          openingNote: "",
        },
      }
    )
    e = await entries.findOne({ _id: e._id })
  }

  // today: two counters pay a vendor for a new bill, so the purchase pages show counter payments
  if (isToday(date) && !e.payments.some((p) => p.vendorPaymentId)) {
    const plan = { M1: ["Fresh Dairy Co", 4200, 2100], M2: ["Royal Stationery", 5600, 5600] }[c.code]
    if (plan) {
      const v = await db.collection("vendors").findOne({ nameLower: plan[0].toLowerCase() })
      if (v) {
        const res = await S.recordCounterVendorPayment(
          db,
          { counterName: c.name, username: "demo" },
          { vendorId: String(v._id), billNumber: `CTR-${date.replace(/-/g, "")}-${c.code}`, billAmount: plan[1], amount: plan[2], items: "bought at the counter" }
        )
        if (res.error) log.push(`vendor payment failed for ${c.name}: ${res.error}`)
        e = await entries.findOne({ _id: e._id })
      }
    }
  }

  // other money in / out through the day (only when nothing was typed in already)
  const payments = [...(e.payments || [])]
  if (payments.length === 0) {
    const n = between(r, 1, 3)
    for (let i = 0; i < n; i++) {
      const [description, lo, hi] = pick(r, OUT_REASONS)
      payments.push({ description, amount: Math.round(between(r, lo, hi) / 10) * 10, type: "OUT", time: at(date, 10 + i * 3, between(r, 0, 55)) })
    }
    if (r() < 0.35) {
      const [description, lo, hi] = pick(r, IN_REASONS)
      payments.push({ description, amount: Math.round(between(r, lo, hi) / 100) * 100, type: "IN", time: at(date, 12, between(r, 0, 55)) })
    }
    payments.sort((a, b) => new Date(a.time) - new Date(b.time))
  }

  // sales
  const cardShare = 0.38 + r() * 0.14
  const creditShare = 0.01 + r() * 0.03
  let sales
  let cashSales
  if (c.fashion) {
    const martTotal = between(r, 30000, 55000)
    const fashionTotal = between(r, 55000, 95000)
    const martCard = Math.round(martTotal * (0.3 + r() * 0.15))
    const fashionCard = Math.round(fashionTotal * cardShare)
    const martCredit = Math.round(martTotal * creditShare)
    const fashionCredit = Math.round(fashionTotal * creditShare)
    sales = { totalSales: 0, cardUpiSales: 0, creditSales: 0, martTotalSales: martTotal, martCardUpi: martCard, martCredit, fashionTotalSales: fashionTotal, fashionCardUpi: fashionCard, fashionCredit }
    cashSales = martTotal - martCard - martCredit + (fashionTotal - fashionCard - fashionCredit)
  } else {
    const total = between(r, c.sales[0], c.sales[1])
    const card = Math.round(total * cardShare)
    const credit = Math.round(total * creditShare)
    sales = { totalSales: total, cardUpiSales: card, creditSales: credit }
    cashSales = total - card - credit
  }

  const totalIn = payments.filter((p) => p.type === "IN").reduce((s, p) => s + p.amount, 0)
  const totalOut = payments.filter((p) => (p.type || "OUT") === "OUT").reduce((s, p) => s + p.amount, 0)
  const opening = e.openingCash
  const expected = opening + cashSales + totalIn - totalOut
  const delta = pick(r, [0, 0, 0, 0, 0, 0, 5, -5, 10, -10, 20, 0])
  const actual = expected + delta

  const closing = breakdown(actual, r, "counter")
  const requested = Math.min(pick(r, [6000, 8000, 10000, 10000, 12000]), Math.floor(calculateClosingCash({ ...emptyDenoms(), notes500: closing.notes500, notes200: closing.notes200, notes100: closing.notes100, notes50: closing.notes50, notes20: closing.notes20, notes10: closing.notes10 }) / 3 / 10) * 10)
  const alloc = allocateNotes(closing, requested)
  const next = emptyDenoms()
  for (const k of NOTE_KEYS) next[k] = alloc.notes[k]
  for (const k of COIN_KEYS) next[k] = closing[k] // coins are always carried in full
  const available = sub(closing, next)

  const closer = pick(r, incharges)
  const submittedAt = at(date, 21, between(r, 5, 50))
  const finalize = !isToday(date)

  await entries.updateOne(
    { _id: e._id, status: "open" },
    {
      $set: {
        sales,
        payments,
        ...(payments.length ? { paymentRefNumber: e.paymentRefNumber || `PE-${date.replace(/-/g, "")}-${c.code}` } : {}),
        closingDenominations: closing,
        nextDayNotesRequested: requested,
        nextDayOpeningDenominations: next,
        nextDayOpeningCash: calculateClosingCash(next),
        availableCheckedDenoms: keysOf(available),
        availableCashHandedOver: true,
        availableCashHandedOverAmount: calculateClosingCash(available),
        availableCashHandedOverAt: submittedAt,
        closedBy: closer,
        submittedExpectedCash: expected,
        submittedActualCash: actual,
        submittedShortage: expected - actual,
        status: finalize ? "confirmed" : "submitted",
        submittedAt,
        ...(finalize ? { confirmedAt: at(addDays(date, 1), 10, between(r, 0, 40)), confirmedBy: "admin" } : {}),
        updatedAt: submittedAt,
      },
    }
  )
  log.push(`${finalize ? "closed " : "submit "} ${date} ${c.name.padEnd(22)} sales ₹${cashSales + sales.cardUpiSales + sales.creditSales + (sales.martCardUpi ?? 0) + (sales.fashionCardUpi ?? 0) + (sales.martCredit ?? 0) + (sales.fashionCredit ?? 0)} cash ₹${actual} short ${expected - actual}`)
}

/* ---------------- purchase counter ---------------- */

const daysCol = db.collection("purchase_days")
const payCol = db.collection("purchase_payments")

async function candidateBills() {
  const vendors = await db.collection("vendors").find({ active: true }).toArray()
  const rows = []
  for (const v of vendors) {
    const d = await S.getVendorDetail(db, String(v._id))
    for (const b of d?.bills ?? []) if (b.outstanding > 500) rows.push({ vendorId: String(v._id), billId: b._id, outstanding: b.outstanding })
  }
  return rows
}

async function fillPurchaseDay(date) {
  let day = await S.getOrCreateDay(db, date)
  if (day.status !== "open") {
    log.push(`skip   ${date} purchase counter (already ${day.status})`)
    return
  }
  const r = rng("purchase" + date)

  // opening from the previous day's kept cash
  const prevDay = (await daysCol.find({ date: { $lt: date } }).sort({ date: -1 }).limit(1).toArray())[0]
  const carried = { ...emptyDenoms(), ...((prevDay?.nextDayOpeningDenominations ?? prevDay?.closingDenominations) || {}) }
  await daysCol.updateOne({ _id: day._id }, { $set: { openingCash: calculateClosingCash(carried), openingDenominations: carried } })

  const push = (field, move) => daysCol.updateOne({ _id: day._id }, { $push: { [field]: move } })
  const moveId = () => new ObjectId().toString()

  // cash handed straight to the staff, counted note by note
  const received = [
    { notes500: 120, notes200: 50, notes100: 100 }, // 80,000
    { notes500: 80, notes200: 40, notes100: 80, notes50: 40 }, // 58,000
    { notes500: 100, notes200: 50, notes100: 60 }, // 66,000
  ][between(r, 0, 2)]
  const staff = () => pick(r, purchaseStaff)
  if ((day.cashIn || []).filter((m) => m.kind === "received").length === 0) {
    const d = { ...emptyDenoms(), ...received }
    await push("cashIn", { id: moveId(), kind: "received", party: "Admin", amount: calculateClosingCash(d), denominations: d, by: staff(), time: at(date, 9, 30) })
  }
  if ((isToday(date) || r() < 0.5) && !(day.cashIn || []).some((m) => m.party === "Owner")) {
    const d = { ...emptyDenoms(), notes500: 30, notes100: 50 } // 20,000 later in the day
    await push("cashIn", { id: moveId(), kind: "received", party: "Owner", amount: calculateClosingCash(d), denominations: d, by: staff(), time: at(date, 14, 10), note: "second lot for evening payments" })
  }
  if ((day.cashOut || []).length === 0)
    await push("cashOut", { id: moveId(), kind: "other-out", party: pick(r, ["Loading & transport", "Tea and snacks", "Packing charges"]), amount: between(r, 2, 8) * 100, by: staff(), time: at(date, 13, 20) })

  // cash payments to vendors against bills that still have something to pay
  const existing = await payCol.countDocuments({ date, voided: { $ne: true }, source: { $ne: "counter" } })
  if (existing === 0) {
    // vendors hand over a couple of new bills during the day
    const vendors = await db.collection("vendors").find({ active: true }).toArray()
    for (let i = 0; i < 2; i++) {
      const v = pick(r, vendors)
      await S.createBill(db, { username: "demo" }, { vendorId: String(v._id), billNumber: `D-${date.replace(/-/g, "")}-${i + 1}`, billDate: date, amount: between(r, 80, 400) * 100, items: pick(r, ["monthly stock", "festival stock", "regular supply", "new arrivals"]) })
    }
    const bills = await candidateBills()
    const used = new Set()
    const n = between(r, 2, 4)
    for (let i = 0; i < n && bills.length; i++) {
      const b = pick(r, bills.filter((x) => !used.has(x.billId)))
      if (!b) break
      used.add(b.billId)
      const amount = Math.min(b.outstanding, between(r, 20, 90) * 100)
      const t = at(date, 10 + i * 2, between(r, 0, 50))
      await payCol.insertOne({
        vendorId: new ObjectId(b.vendorId),
        billId: new ObjectId(b.billId),
        date,
        amount,
        mode: "cash",
        settlesVoucherId: null,
        source: "purchase",
        paidBy: staff(),
        voided: false,
        createdAt: t,
        createdBy: "demo",
      })
      b.outstanding -= amount
    }
  }

  // count the drawer, keep some for tomorrow, hand the rest to the admin
  day = await daysCol.findOne({ _id: day._id })
  const payments = await payCol.find({ date, voided: { $ne: true } }).toArray()
  let summary = S.summarize(day, payments)
  if (summary.expected < 6000) throw new Error(`purchase day ${date} would be short of cash (${summary.expected})`)

  const delta = pick(r, [0, 0, 0, 0, 10, -10, 0])
  const actual = Math.round(summary.expected) + delta
  const closing = breakdown(actual, r, "purchase")
  const keepAsk = Math.min(pick(r, [5000, 10000, 15000, 20000]), Math.floor(actual / 2 / 10) * 10)
  const alloc = allocateNotes(closing, keepAsk)
  const keep = emptyDenoms()
  for (const k of NOTE_KEYS) keep[k] = alloc.notes[k]
  const handover = sub(closing, keep)
  const final = !isToday(date)
  const closedAt = at(date, 20, between(r, 10, 50))

  await daysCol.updateOne(
    { _id: day._id, status: "open" },
    {
      $set: {
        closingDenominations: closing,
        nextDayOpeningDenominations: keep,
        handoverDenominations: handover,
        handoverAmount: calculateClosingCash(handover),
        status: final ? "confirmed" : "submitted",
        closedBy: staff(),
        submittedBy: "purchase",
        submittedAt: closedAt,
        submittedExpectedCash: summary.expected,
        submittedActualCash: actual,
        submittedShortage: summary.expected - actual,
        ...(final
          ? {
              confirmedAt: at(addDays(date, 1), 10, 15),
              confirmedBy: "admin",
              handoverReceivedAt: at(addDays(date, 1), 10, 5),
              handoverReceivedBy: "admin",
            }
          : {}),
        updatedAt: closedAt,
      },
    }
  )
  log.push(`${final ? "closed " : "submit "} ${date} purchase counter       paid ₹${summary.paidCash} cash, drawer ₹${actual}, kept ₹${calculateClosingCash(keep)}, to admin ₹${calculateClosingCash(handover)}`)
}

/* ---------------- run, oldest day first ---------------- */

try {
  console.log(`Filling ${dates.join(", ")} in ${dbName}`)
  for (const date of dates) {
    for (const c of COUNTERS) await fillCounterDay(c, date)
    await fillPurchaseDay(date)
  }
} finally {
  console.log(log.join("\n"))
  await client.close()
  fs.rmSync(out, { recursive: true, force: true })
}
