// Regression test for the purchase counter's money rules (balances, part payments,
// cheques, vouchers, daily cash). It works in a throwaway database that is created
// and dropped by the test, so real data is never touched.
//
// Run:  npm run test:purchase     (needs MONGODB_URI in .env.local; Atlas or any replica set)
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(pathToFileURL(root + path.sep))
const ts = require("typescript")

// compile the lib files we need into a temp folder inside the project (so "mongodb" resolves)
const out = path.join(root, ".scratch-test")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out)
const files = ["purchase-service", "purchase", "entries", "next-day", "types", "action-result", "validation", "report", "incharge-group", "text-format"]
for (const f of files) {
  const source = fs.readFileSync(path.join(root, "lib", f + ".ts"), "utf8")
  let js = ts.transpileModule(source, { compilerOptions: { module: "ESNext", target: "ES2022" } }).outputText
  js = js.replace(/from "(\.\/[a-z-]+)"/g, 'from "$1.mjs"')
  fs.writeFileSync(path.join(out, f + ".mjs"), js)
}
const url = (p) => pathToFileURL(path.join(root, p)).href

const { MongoClient } = await import(url("node_modules/mongodb/lib/index.js"))
const S = await import(url(".scratch-test/purchase-service.mjs"))
const { todayIST } = await import(url(".scratch-test/report.mjs"))
const Pm = await import(url(".scratch-test/purchase.mjs"))

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const dbName = "smartcash_scratch_" + Date.now()
const db = client.db(dbName)
const actor = { username: "tester" }
const today = todayIST()

let passed = 0, failed = 0
const t = (name, cond, extra = "") => {
  if (cond) { passed++; console.log("ok  ", name) } else { failed++; console.log("FAIL", name, extra) }
}
const isErr = (r) => !!r && typeof r.error === "string" && r.error.length > 0
const approx = (a, b) => Math.abs(a - b) < 0.005

try {
  // indexes the app creates (unique numbers etc.)
  await db.collection("vendors").createIndex({ nameLower: 1 }, { unique: true })
  await db.collection("purchase_bills").createIndex({ vendorId: 1, billNumberLower: 1 }, { unique: true })
  await db.collection("vouchers").createIndex({ numberLower: 1 }, { unique: true })
  await db.collection("purchase_days").createIndex({ date: 1 }, { unique: true })

  await db.collection("incharges").insertMany([
    { name: "Ravi", group: "purchase", active: true }, // purchase staff
    { name: "Shop Person", active: true }, // a counter in-charge (no group = counter)
  ])
  await db.collection("banks").createIndex({ nameLower: 1 }, { unique: true })
  await db.collection("banks").insertMany([
    { name: "SBI", nameLower: "sbi", active: true },
    { name: "HDFC", nameLower: "hdfc", active: true },
  ])

  // ===== vendors
  let r = await S.createVendor(db, actor, { name: "  Sri   Traders ", phone: "999", items: "rice, oil", openingBalance: 5000 })
  t("create vendor", !isErr(r) && r.vendorId, JSON.stringify(r))
  const v1 = r.vendorId
  t("duplicate vendor name refused", isErr(await S.createVendor(db, actor, { name: "sri traders" })))
  t("empty vendor name refused", isErr(await S.createVendor(db, actor, { name: "  " })))
  t("bad opening balance refused", isErr(await S.createVendor(db, actor, { name: "X", openingBalance: -5 })))
  r = await S.createVendor(db, actor, { name: "Mega Foods" })
  const v2 = r.vendorId

  // ===== names are saved with a capital at the start of every word
  {
    const { properCase } = await import(url(".scratch-test/text-format.mjs"))
    t("proper case: lower", properCase("smart mart") === "Smart Mart")
    t("proper case: all capitals", properCase("SRI LAKSHMI TRADERS") === "Sri Lakshmi Traders")
    t("proper case: own capitals kept", properCase("SmartMart") === "SmartMart")
    t("proper case: first letter forced up", properCase("smartMart") === "SmartMart")
    t("proper case: items list", properCase("rice, OIL, packaged snacks") === "Rice, Oil, Packaged Snacks")
    t("proper case: address", properCase("12/3, main road, near bus stand") === "12/3, Main Road, Near Bus Stand")
    t("proper case: ordinals untouched", properCase("1st floor, 2nd cross") === "1st Floor, 2nd Cross")
    t("proper case: initials stay capital", properCase("K S RAMAN") === "K S Raman")
    t("proper case: apostrophe", properCase("men's wear") === "Men's Wear")
    r = await S.createVendor(db, actor, { name: "  new  VENDOR traders ", items: "RICE and oil", address: "5th street, anna nagar", contactPerson: "ramesh KUMAR", gstin: "33abcde1234f1z5" })
    const doc = await db.collection("vendors").findOne({ nameLower: "new vendor traders" })
    t("vendor name is saved properly", doc?.name === "New Vendor Traders", doc?.name)
    t("supplies are saved properly", doc?.items === "Rice And Oil", doc?.items)
    t("address is saved properly", doc?.address === "5th Street, Anna Nagar", doc?.address)
    t("contact person is saved properly", doc?.contactPerson === "Ramesh Kumar", doc?.contactPerson)
    t("GST number is saved in capitals", doc?.gstin === "33ABCDE1234F1Z5", doc?.gstin)
    t("a different spelling of the same name is a duplicate", isErr(await S.createVendor(db, actor, { name: "NEW VENDOR TRADERS" })))
    t("spaces and punctuation do not make a new vendor", isErr(await S.createVendor(db, actor, { name: "new-vendor  traders." })))
    t("joined-up spelling is the same vendor", isErr(await S.createVendor(db, actor, { name: "NewVendorTraders" })))
    t("a genuinely different name is accepted", !isErr(await S.createVendor(db, actor, { name: "New Vendor Traders East" })))
    await db.collection("vendors").deleteOne({ nameLower: "new vendor traders east" })
    await db.collection("vendors").deleteOne({ nameLower: "new vendor traders" })
  }

  // ===== bills
  r = await S.createBill(db, actor, { vendorId: v1, billNumber: "B-100", billDate: today, amount: 100000, items: "rice 50 bags" })
  t("create bill", !isErr(r) && r.billId, JSON.stringify(r))
  const bill1 = r.billId
  t("duplicate bill number refused", isErr(await S.createBill(db, actor, { vendorId: v1, billNumber: "b-100", billDate: today, amount: 5 })))
  t("future bill date refused", isErr(await S.createBill(db, actor, { vendorId: v1, billNumber: "B-101", billDate: "2999-01-01", amount: 5 })))
  t("zero bill amount refused", isErr(await S.createBill(db, actor, { vendorId: v1, billNumber: "B-102", billDate: today, amount: 0 })))
  t("same number allowed for another vendor", !isErr(await S.createBill(db, actor, { vendorId: v2, billNumber: "B-100", billDate: today, amount: 30000 })))

  let d = await S.getVendorDetail(db, v1)
  t("balance: opening 5000 + bill 100000", approx(d.balance.totalToPay, 105000), JSON.stringify(d.balance))

  // ===== payments: cash, part payments
  const pay = (o) => S.recordPayment(db, actor, { vendorId: v1, paidBy: "Ravi", ...o })
  r = await pay({ billId: bill1, amount: 20000, mode: "cash" })
  t("part payment in cash", !isErr(r), JSON.stringify(r))
  d = await S.getVendorDetail(db, v1)
  const b = d.bills[0]
  t("bill is part paid, 80000 left", b.status === "part" && approx(b.outstanding, 80000), JSON.stringify(b))
  t("vendor total 85000", approx(d.balance.totalToPay, 85000), JSON.stringify(d.balance))
  t("overpaying a bill refused", isErr(await pay({ billId: bill1, amount: 80000.01, mode: "cash" })))
  t("a counter in-charge is not purchase staff", isErr(await S.recordPayment(db, actor, { vendorId: v1, billId: bill1, amount: 1, mode: "cash", paidBy: "Shop Person" })))
  t("not an in-charge refused", isErr(await S.recordPayment(db, actor, { vendorId: v1, billId: bill1, amount: 1, mode: "cash", paidBy: "Nobody" })))
  t("negative amount refused", isErr(await pay({ billId: bill1, amount: -5, mode: "cash" })))
  t("unknown mode refused", isErr(await pay({ billId: bill1, amount: 5, mode: "bitcoin" })))

  // ===== cheque
  r = await pay({ billId: bill1, amount: 30000, mode: "cheque", cheque: { number: "000123", bank: "SBI", chequeDate: "2999-12-01" } })
  t("cheque payment (post-dated)", !isErr(r), JSON.stringify(r))
  t("cheque on a bank that is not in the list is refused", isErr(await pay({ billId: bill1, amount: 1, mode: "cheque", cheque: { number: "555", bank: "Unknown Bank", chequeDate: today } })))
  t("cheque needs number", isErr(await pay({ billId: bill1, amount: 1, mode: "cheque", cheque: { bank: "SBI", chequeDate: today } })))
  t("duplicate cheque refused", isErr(await pay({ billId: bill1, amount: 1, mode: "cheque", cheque: { number: "000123", bank: "sbi", chequeDate: today } })))
  d = await S.getVendorDetail(db, v1)
  t("after cheque, total 55000", approx(d.balance.totalToPay, 55000), JSON.stringify(d.balance))
  t("one cheque issued", d.cheques.length === 1 && d.cheques[0].status === "issued")
  const chequeId = d.cheques[0]._id

  t("bounce cheque", !isErr(await S.setChequeStatus(db, chequeId, "bounced")))
  d = await S.getVendorDetail(db, v1)
  t("bounced cheque puts 30000 back (total 85000)", approx(d.balance.totalToPay, 85000), JSON.stringify(d.balance))
  t("cannot change a bounced cheque again", isErr(await S.setChequeStatus(db, chequeId, "cleared")))

  // a cheque that clears stays paid
  await pay({ billId: bill1, amount: 10000, mode: "cheque", cheque: { number: "000124", bank: "SBI", chequeDate: today } })
  d = await S.getVendorDetail(db, v1)
  const c2 = d.cheques.find((c) => c.number === "000124")
  t("clear a cheque", !isErr(await S.setChequeStatus(db, c2._id, "cleared")))
  d = await S.getVendorDetail(db, v1)
  t("cleared cheque stays paid (total 75000)", approx(d.balance.totalToPay, 75000), JSON.stringify(d.balance))

  // ===== voucher: bill counts as paid, still owed until settled
  r = await pay({ billId: bill1, amount: 50000, mode: "voucher", voucher: { number: "V-1", promisedDate: "2999-01-01" } })
  t("voucher payment", !isErr(r), JSON.stringify(r))
  d = await S.getVendorDetail(db, v1)
  t("voucher: bills outstanding 25000 -> wait: opening 5000 + 100000 - 20000 - 10000 - 50000", approx(d.balance.billsOutstanding, 25000), JSON.stringify(d.balance))
  t("voucher: pending 50000", approx(d.balance.vouchersPending, 50000), JSON.stringify(d.balance))
  t("voucher: total to pay stays 75000", approx(d.balance.totalToPay, 75000), JSON.stringify(d.balance))
  t("duplicate voucher number refused", isErr(await pay({ billId: bill1, amount: 1, mode: "voucher", voucher: { number: "v-1" } })))
  const voucher = d.vouchers[0]

  // settle with cash
  r = await S.settleVoucher(db, actor, { voucherId: voucher._id, mode: "cash", paidBy: "Ravi" })
  t("settle voucher with cash", !isErr(r), JSON.stringify(r))
  d = await S.getVendorDetail(db, v1)
  t("settled: pending 0, bills outstanding unchanged 25000, total 25000", approx(d.balance.vouchersPending, 0) && approx(d.balance.billsOutstanding, 25000) && approx(d.balance.totalToPay, 25000), JSON.stringify(d.balance))
  t("cannot settle twice", isErr(await S.settleVoucher(db, actor, { voucherId: voucher._id, mode: "cash", paidBy: "Ravi" })))

  // voucher cancelled -> bill balance comes back
  r = await pay({ billId: bill1, amount: 5000, mode: "voucher", voucher: { number: "V-2" } })
  d = await S.getVendorDetail(db, v1)
  const v2c = d.vouchers.find((x) => x.number === "V-2")
  t("cancel pending voucher", !isErr(await S.cancelVoucher(db, v2c._id)))
  d = await S.getVendorDetail(db, v1)
  t("after cancel total back to 25000", approx(d.balance.totalToPay, 25000), JSON.stringify(d.balance))

  // voucher settled by cheque that bounces -> voucher pending again
  await pay({ billId: bill1, amount: 7000, mode: "voucher", voucher: { number: "V-3" } })
  d = await S.getVendorDetail(db, v1)
  const v3 = d.vouchers.find((x) => x.number === "V-3")
  await S.settleVoucher(db, actor, { voucherId: v3._id, mode: "cheque", paidBy: "Ravi", cheque: { number: "000200", bank: "HDFC", chequeDate: today } })
  d = await S.getVendorDetail(db, v1)
  const ch3 = d.cheques.find((c) => c.number === "000200")
  await S.setChequeStatus(db, ch3._id, "bounced")
  d = await S.getVendorDetail(db, v1)
  t("bounced settlement cheque makes the voucher pending again", d.vouchers.find((x) => x.number === "V-3").status === "pending", JSON.stringify(d.vouchers.map((x) => [x.number, x.status])))
  t("...and the debt is owed again (25000-7000 bills + 7000 voucher = 25000)", approx(d.balance.totalToPay, 25000), JSON.stringify(d.balance))

  // ===== on-account payment (opening balance)
  r = await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 40000, mode: "cash" })
  t("cannot pay on account more than owed (30000)", isErr(r), JSON.stringify(r))

  // ===== bills edit / delete rules
  t("cannot cut bill below what is paid", isErr(await S.updateBill(db, bill1, { billNumber: "B-100", billDate: today, amount: 1000 })))
  t("cannot delete a bill with payments", isErr(await S.deleteBill(db, bill1)))
  r = await S.createBill(db, actor, { vendorId: v2, billNumber: "B-200", billDate: today, amount: 100 })
  t("delete an unpaid bill", !isErr(await S.deleteBill(db, r.billId)))

  // ===== cash payment cancel
  r = await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 1000, mode: "cash" })
  let view = await S.getDayView(db, today)
  const cashRow = view.payments.find((p) => p.vendorName === "Mega Foods" && p.mode === "cash")
  t("cash payment appears on the day", !!cashRow)
  t("cancel today's cash payment", !isErr(await S.cancelCashPayment(db, cashRow._id)))

  // ===== daily cash
  await db.collection("purchase_days").updateOne({ date: today }, { $push: { cashIn: { id: "a", party: "Admin", amount: 200000, time: new Date().toISOString() } } })
  view = await S.getDayView(db, today)
  // cash paid today: 20000 (part) + 25000? list: part 20000 cash, settle V-1 50000 cash
  t("day: received 200000", approx(view.summary.received, 200000), JSON.stringify(view.summary))
  t("day: cash paid = 20000 + 50000", approx(view.summary.paidCash, 70000), JSON.stringify(view.summary))
  t("day: expected = 200000 - 70000 = 130000", approx(view.summary.expected, 130000), JSON.stringify(view.summary))
  t("day: cheque paid counted separately (10000 cleared; bounced ones excluded)", approx(view.summary.paidCheque, 10000), JSON.stringify(view.summary))
  t("day: vendors paid count", view.summary.vendorsPaid >= 1)

  t("closing count must be valid", isErr(await S.updateClosing(db, { notes500: -1 })))
  t("save closing count (no keep decision yet)", !isErr(await S.updateClosing(db, { notes500: 250, notes100: 50 })))
  view = await S.getDayView(db, today)
  t("counted 130000, shortage 0", approx(view.summary.counted, 130000) && approx(view.summary.shortage, 0), JSON.stringify(view.summary))
  t("submit needs a decision on cash to keep", isErr(await S.submitDay(db, actor, "Ravi")))
  await S.updateClosing(db, { notes500: 250, notes100: 50 }, { notes500: 999 })
  let dayDoc = await db.collection("purchase_days").findOne({ date: today })
  t("cash to keep is capped to what was counted (250 x 500)", dayDoc.nextDayOpeningDenominations.notes500 === 250, JSON.stringify(dayDoc.nextDayOpeningDenominations))
  t("keep 20000 (40 x 500)", !isErr(await S.updateClosing(db, { notes500: 250, notes100: 50 }, { notes500: 40 })))
  t("submit needs an in-charge", isErr(await S.submitDay(db, actor, "Nobody")))
  t("submit day", !isErr(await S.submitDay(db, actor, "Ravi")))
  view = await S.getDayView(db, today)
  t("after submit: keep 20000, hand over 110000", approx(view.summary.keep, 20000) && approx(view.summary.handover, 110000), JSON.stringify(view.summary))
  t("handover is recorded", approx(view.day.handoverAmount, 110000), JSON.stringify(view.day))
  t("cannot submit twice", isErr(await S.submitDay(db, actor, "Ravi")))
  t("no payments after submit", isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 100, mode: "cash" })))
  t("no closing edits after submit", isErr(await S.updateClosing(db, { notes500: 1 })))
  // ===== the admin pays a vendor: allowed even though the purchase day is submitted, never touches the drawer
  const before = (await S.getDayView(db, today)).summary
  r = await S.recordPayment(db, { username: "admin" }, { vendorId: v2, amount: 5000, mode: "cash" }, "admin")
  t("admin can pay a vendor while the purchase day is submitted", !isErr(r), JSON.stringify(r))
  let after = (await S.getDayView(db, today)).summary
  t("admin payment does not change the purchase drawer", approx(after.expected, before.expected) && approx(after.paidCash, before.paidCash), JSON.stringify(after))
  t("admin payment is counted separately", approx(after.paidByAdmin, 5000), JSON.stringify(after))
  d = await S.getVendorDetail(db, v2)
  const adminPay = d.payments.find((p) => p.source === "admin")
  t("payment shows who paid", !!adminPay && adminPay.paidBy === "admin")
  t("admin cannot overpay either", isErr(await S.recordPayment(db, { username: "admin" }, { vendorId: v2, amount: 999999, mode: "cash" }, "admin")))
  r = await S.recordPayment(db, { username: "admin" }, { vendorId: v2, amount: 2000, mode: "cheque", cheque: { number: "A-1", bank: "HDFC", chequeDate: today } }, "admin")
  t("admin can pay by cheque", !isErr(r), JSON.stringify(r))
  d = await S.getVendorDetail(db, v2)
  const adminCheque = d.cheques.find((c) => c.number === "A-1")
  t("admin clears the cheque", !isErr(await S.setChequeStatus(db, adminCheque._id, "cleared")))
  t("purchase counter cannot cancel the admin's cash payment", isErr(await S.cancelCashPayment(db, adminPay._id, "purchase")))
  t("admin cancels the admin's own payment", !isErr(await S.cancelCashPayment(db, adminPay._id, "admin")))
  after = (await S.getDayView(db, today)).summary
  t("cancelled admin payment no longer counted", approx(after.paidByAdmin, 2000), JSON.stringify(after))

  // ===== a shop counter pays a vendor for a NEW bill, in cash
  const counter = { counterName: "Smart Mart Counter 1", username: "mart1" }
  const entries = db.collection("entries")
  const newBill = { vendorId: v2, billNumber: "CTR-1", billAmount: 10000, amount: 4000 }
  t("counter must have an open, verified day", isErr(await S.recordCounterVendorPayment(db, counter, newBill)))
  await entries.insertOne({ counterName: counter.counterName, date: today, status: "open", openingVerified: true, payments: [] })

  const owedBefore = (await S.getVendorDetail(db, v2)).balance.totalToPay
  const drawerBefore = (await S.getDayView(db, today)).summary
  r = await S.recordCounterVendorPayment(db, counter, { ...newBill, items: "snacks", note: "paid at counter" })
  t("counter pays part of a new bill", !isErr(r), JSON.stringify(r))
  let entry = await entries.findOne({ counterName: counter.counterName, date: today })
  t("shows as Money out (the amount paid) on the counter's page", entry.payments.length === 1 && entry.payments[0].type === "OUT" && entry.payments[0].amount === 4000 && !!entry.payments[0].vendorPaymentId && entry.payments[0].description.includes("CTR-1"), JSON.stringify(entry.payments))

  d = await S.getVendorDetail(db, v2)
  const made = d.bills.find((b) => b.billNumber === "CTR-1")
  t("the new bill is recorded against the vendor", !!made && made.amount === 10000 && made.paid === 4000 && approx(made.outstanding, 6000) && made.status === "part", JSON.stringify(made))
  t("the bill says it was entered by the counter", made.createdBy === counter.counterName)
  t("vendor now owes 6000 more (10000 billed - 4000 paid)", approx(d.balance.totalToPay, owedBefore + 6000), JSON.stringify(d.balance))
  const after1 = (await S.getDayView(db, today)).summary
  t("counted separately; the purchase drawer is untouched", approx(after1.paidByCounters - drawerBefore.paidByCounters, 4000) && approx(after1.expected, drawerBefore.expected))

  t("bill number cannot be reused for the same vendor", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "ctr-1" })))
  t("cannot pay more than the bill amount", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-2", amount: 10000.01 })))
  t("bill number is required", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: " " })))
  t("bill amount is required", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-3", billAmount: 0 })))
  t("amount paid is required", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-4", amount: 0 })))
  t("a future bill date is refused", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-5", billDate: "2999-01-01" })))
  t("counter cannot pay by cheque", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-6", mode: "cheque" })))
  t("counter cannot pay by voucher", isErr(await S.recordCounterVendorPayment(db, counter, { ...newBill, billNumber: "CTR-7", mode: "voucher" })))
  t("nothing was recorded for the refused attempts", (await S.getVendorDetail(db, v2)).bills.filter((b) => b.billNumber.startsWith("CTR-")).length === 1)

  // paying a whole new bill
  r = await S.recordCounterVendorPayment(db, counter, { vendorId: v1, billNumber: "CTR-FULL", billAmount: 2500, amount: 2500 })
  t("a new bill can be paid in full", !isErr(r), JSON.stringify(r))
  t("...and shows as paid", (await S.getVendorDetail(db, v1)).bills.find((b) => b.billNumber === "CTR-FULL").status === "paid")

  // cancelling
  const vp = entry.payments[0].vendorPaymentId
  t("another counter cannot cancel it", isErr(await S.cancelCounterVendorPayment(db, { counterName: "Smart Mart Counter 2", username: "mart2" }, vp)))
  // someone else (the admin) pays more on the same bill first, so the bill must survive the counter's cancel
  r = await S.recordPayment(db, { username: "admin" }, { vendorId: v2, billId: made._id, amount: 1000, mode: "cash" }, "admin")
  t("the admin pays another part of that bill", !isErr(r), JSON.stringify(r))
  r = await S.cancelCounterVendorPayment(db, counter, vp)
  t("counter cancels its payment", !isErr(r), JSON.stringify(r))
  entry = await entries.findOne({ counterName: counter.counterName, date: today })
  t("the Money out line for that payment is removed", !entry.payments.some((x) => x.vendorPaymentId === vp))
  d = await S.getVendorDetail(db, v2)
  const kept = d.bills.find((b) => b.billNumber === "CTR-1")
  t("the bill stays when someone else paid on it (9000 now left)", !!kept && approx(kept.outstanding, 9000), JSON.stringify(kept))

  // a bill with no other payment disappears along with its cancelled payment
  const fullVp = entry.payments.find((x) => x.description.includes("CTR-FULL")).vendorPaymentId
  t("cancel a counter payment that was the only payment on its bill", !isErr(await S.cancelCounterVendorPayment(db, counter, fullVp)))
  t("...the bill that came with it is removed", !(await S.getVendorDetail(db, v1)).bills.some((b) => b.billNumber === "CTR-FULL"))

  const counterVendors = await S.listCounterVendors(db)
  t("a counter can choose from all active vendors", counterVendors.length >= 2 && counterVendors.every((x) => x.name))
  await entries.updateOne({ counterName: counter.counterName, date: today }, { $set: { status: "submitted" } })

  t("confirm", !isErr(await S.confirmDay(db, actor, today)))
  t("admin receives the handover", !isErr(await S.acknowledgeHandover(db, actor, today)))
  t("handover can only be received once", isErr(await S.acknowledgeHandover(db, actor, today)))
  t("unlock", !isErr(await S.unlockDay(db, today)))
  dayDoc = await db.collection("purchase_days").findOne({ date: today })
  t("unlock clears the handover receipt", !dayDoc.handoverReceivedAt)
  t("payments allowed again after unlock", !isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 100, mode: "cash" })))

  // ===== paying against a brand-new bill from the payment form
  {
    const nb = { billNumber: "NB-1", billDate: today, amount: 5000, items: "new stock" }
    const owed0 = (await S.getVendorDetail(db, v2)).balance.totalToPay
    t("new bill: payment cannot exceed the bill", isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 5000.01, mode: "cash", newBill: nb })))
    t("new bill: needs a bill number", isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 100, mode: "cash", newBill: { ...nb, billNumber: " " } })))
    t("new bill: cannot also name an existing bill", isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 100, mode: "cash", billId: bill1, newBill: nb })))
    t("nothing was saved by the refused attempts", (await S.getVendorDetail(db, v2)).bills.every((x) => x.billNumber !== "NB-1"))
    r = await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 2000, mode: "cash", newBill: nb })
    t("pay part of a new bill", !isErr(r), JSON.stringify(r))
    d = await S.getVendorDetail(db, v2)
    const made = d.bills.find((x) => x.billNumber === "NB-1")
    t("the bill is recorded and part paid", !!made && made.amount === 5000 && approx(made.outstanding, 3000) && made.status === "part", JSON.stringify(made))
    t("vendor owes the 3000 more", approx(d.balance.totalToPay, owed0 + 3000))
    t("same bill number cannot be used again", isErr(await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 100, mode: "cash", newBill: nb })))
    r = await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 1000, mode: "cheque", newBill: { ...nb, billNumber: "NB-2" }, cheque: { number: "NB900", bank: "SBI", chequeDate: today } })
    t("a new bill can be paid by cheque too", !isErr(r), JSON.stringify(r))
    t("admin can pay a new bill", !isErr(await S.recordPayment(db, actor, { vendorId: v2, amount: 500, mode: "cash", newBill: { ...nb, billNumber: "NB-3" } }, "admin")))
  }

  // ===== cash handed straight to the purchase staff, and other money in / out
  {
    const before = (await S.getDayView(db, today)).summary
    const d1 = { notes500: 2, notes100: 3, coins10: 5 } // 1000 + 300 + 50 = 1350
    t("cash received needs notes", isErr(await S.recordCashReceived(db, { denominations: {}, receivedBy: "Ravi" })))
    t("cash received needs a purchase staff name", isErr(await S.recordCashReceived(db, { denominations: d1, receivedBy: "Nobody" })))
    t("cash received refuses bad counts", isErr(await S.recordCashReceived(db, { denominations: { notes500: -1 }, receivedBy: "Ravi" })))
    r = await S.recordCashReceived(db, { denominations: d1, receivedBy: "Ravi", from: "Owner" })
    t("cash received is recorded from the denominations", !isErr(r) && r.amount === 1350, JSON.stringify(r))
    r = await S.recordCashReceived(db, { denominations: { notes200: 1 }, receivedBy: "Ravi" })
    t("cash can be received more than once in a day", !isErr(r))
    let sm = (await S.getDayView(db, today)).summary
    t("cash in hand rises by both", approx(sm.expected - before.expected, 1550) && approx(sm.received - before.received, 1550))

    t("other money out needs a reason", isErr(await S.recordMoneyMove(db, "out", { amount: 100, reason: " ", by: "Ravi" })))
    t("other money out needs an amount", isErr(await S.recordMoneyMove(db, "out", { amount: 0, reason: "Tea", by: "Ravi" })))
    t("other money needs staff", isErr(await S.recordMoneyMove(db, "out", { amount: 100, reason: "Tea", by: "" })))
    t("other money out recorded", !isErr(await S.recordMoneyMove(db, "out", { amount: 120, reason: "Transport", by: "Ravi" })))
    t("other money in recorded", !isErr(await S.recordMoneyMove(db, "in", { amount: 30, reason: "Supplier refund", by: "Ravi" })))
    sm = (await S.getDayView(db, today)).summary
    t("cash in hand follows other money in/out", approx(sm.expected - before.expected, 1550 - 120 + 30), String(sm.expected - before.expected))

    // remove everything we added again
    const dayNow = (await S.getDayView(db, today)).day
    const mine = [...dayNow.cashIn, ...dayNow.cashOut].filter((m) => m.kind)
    t("the entries carry their kind", mine.length === 4)
    for (const m of mine) t("remove entry", !isErr(await S.cancelCashMove(db, m.id)))
    sm = (await S.getDayView(db, today)).summary
    t("back to where it started after removing", approx(sm.expected, before.expected))
    t("removing an unknown entry fails", isErr(await S.cancelCashMove(db, "nope")))
  }

  // ===== next day carries the counted cash
  const tomorrow = "2999-01-02"
  const next = await S.getOrCreateDay(db, tomorrow)
  t("next day opens with only the 20000 that was kept", approx(next.openingCash, 20000), String(next.openingCash))

  // keeping nothing: everything is handed over, tomorrow opens empty
  await db.collection("purchase_days").updateOne({ date: today }, { $set: { nextDayOpeningDenominations: { notes500: 0 } } })
  const next2 = await S.getOrCreateDay(db, "2999-02-02")
  t("keeping nothing opens the next day at 0", approx(next2.openingCash, 0), String(next2.openingCash))

  // a day closed before this feature existed carries everything it counted
  await db.collection("purchase_days").insertOne({ date: "2997-01-01", closingDenominations: { notes500: 10 }, cashIn: [], cashOut: [], status: "confirmed", openingCash: 0 })
  const next3 = await S.getOrCreateDay(db, "2997-01-02")
  t("older days (no keep recorded) still carry all of the count", approx(next3.openingCash, 5000), String(next3.openingCash))

  // ===== report
  const rep = await S.getDayReport(db, today, today)
  t("report row for today", rep.length === 1 && rep[0].paidCash > 0, JSON.stringify(rep))

  // ===== banks
  t("cheque bank is stored with the list's spelling", (await S.listCheques(db)).some((c) => c.bank === "SBI"))
  t("adding an existing bank is refused", isErr(await S.addBank(db, actor, "  sbi ")))
  t("add a new bank", !isErr(await S.addBank(db, actor, "Axis Bank")))
  t("empty bank name refused", isErr(await S.addBank(db, actor, " ")))
  await db.collection("cheques").insertOne({ vendorId: null, number: "old1", numberLower: "old1", bank: "Canara Bank", bankLower: "canara bank", chequeDate: today, amount: 1, status: "cleared", issuedDate: today })
  let banks = await S.listBanks(db)
  t("banks used on older cheques are added to the list automatically", banks.some((b) => b.name === "Canara Bank"), JSON.stringify(banks.map((b) => b.name)))
  const axis = banks.find((b) => b.name === "Axis Bank")
  t("hide a bank", !isErr(await S.setBankActive(db, axis._id, false)))
  r = await S.recordPayment(db, actor, { vendorId: v2, paidBy: "Ravi", amount: 10, mode: "cheque", billId: undefined, cheque: { number: "777", bank: "Axis Bank", chequeDate: today } })
  t("a hidden bank cannot be used for new cheques", isErr(r), JSON.stringify(r))
  t("adding a hidden bank brings it back", !isErr(await S.addBank(db, actor, "axis bank")))

  // ===== the vendor timeline always ends on the vendor's real balance
  for (const [name, id] of [["Sri Traders", v1], ["Mega Foods", v2]]) {
    const det = await S.getVendorDetail(db, id)
    const tl = Pm.buildTimeline(det)
    t(`timeline for ${name} ends on what is owed (${det.balance.totalToPay})`, tl.length > 0 && approx(tl[tl.length - 1].balanceAfter, det.balance.totalToPay), JSON.stringify(tl.map((e) => [e.title, e.balanceAfter])))
    t(`timeline for ${name} starts with the vendor being added`, tl[0].kind === "vendor")
    t(`timeline for ${name} has its bills and payments`, tl.some((e) => e.kind === "bill") && tl.some((e) => e.kind === "payment"))
  }
  const det2 = await S.getVendorDetail(db, v2)
  const tl2 = Pm.buildTimeline(det2)
  t("timeline names who paid (admin, counter, purchase)", tl2.some((e) => /Admin/.test(e.detail || "")) && tl2.some((e) => /Smart Mart Counter 1/.test(e.detail || "")))
  const det1 = await S.getVendorDetail(db, v1)
  const tl1 = Pm.buildTimeline(det1)
  t("timeline shows a bounced cheque being taken back", tl1.some((e) => e.kind === "reversal" && /bounced/.test(e.title)), JSON.stringify(tl1.map((e) => e.title)))
  t("timeline shows a cancelled voucher", tl1.some((e) => e.kind === "reversal" && /cancelled/.test(e.title)))
  t("timeline shows a cheque clearing", tl1.some((e) => e.kind === "cheque" && /cleared/.test(e.title)))

  // ===== lists
  const vendors = await S.listVendors(db)
  t("vendor list has balances", vendors.length === 2 && vendors.every((x) => typeof x.balance.totalToPay === "number"))
  const cheques = await S.listCheques(db)
  t("cheque list", cheques.length >= 3)
  const vouchers = await S.listVouchers(db)
  t("voucher list", vouchers.length >= 3)
} catch (e) {
  failed++
  console.log("CRASH", e)
} finally {
  await client.db(dbName).dropDatabase()
  await client.close()
  fs.rmSync(out, { recursive: true, force: true })
}
console.log(`\n${passed} passed, ${failed} failed (scratch database ${dbName} dropped)`)

process.exit(failed === 0 ? 0 : 1)
