// Adds DEMO vendors, bills and payments (cash / cheque / voucher, by the purchase counter,
// the admin and shop counters) to a TEST database so the purchase pages have data to look at.
// Refuses the live database. Remove it again with scripts/reset-purchase-data.mjs --apply.
//
// Run:  node --env-file=.env.local scripts/seed-purchase-demo.mjs
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

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db(dbName)
const actor = { username: "demo" }
const today = todayIST()
const log = []
const done = db.collection("demo_seed")
const once = async (label, fn) => {
  if (await done.findOne({ label })) {
    log.push(`done   ${label} (earlier run)`)
    return { skipped: true }
  }
  const r = await fn()
  const bad = r && typeof r.error === "string" && r.error
  if (!bad) await done.insertOne({ label })
  log.push(`${bad ? "FAILED " : "ok     "}${label}${bad ? " -> " + bad : ""}`)
  return r
}

try {
  console.log(`Adding demo data to ${dbName}`)

  // purchase staff + banks
  for (const name of ["Ravi", "Meena"]) {
    await db.collection("incharges").updateOne(
      { name, group: "purchase" },
      { $setOnInsert: { name, group: "purchase", active: true, createdAt: new Date(), createdBy: "demo" } },
      { upsert: true }
    )
  }
  for (const b of ["SBI", "HDFC Bank", "Canara Bank"]) await once("bank " + b, () => S.addBank(db, actor, b))

  const vendors = [
    ["Sri Lakshmi Traders", "Rice, oil, pulses", 12000],
    ["Mega Foods", "Snacks, biscuits", 0],
    ["Anand Textiles", "Fashion - sarees, fabric", 25000],
    ["Fresh Dairy Co", "Milk products", 0],
    ["Royal Stationery", "Stationery, fancy items", 3000],
    ["Bharath Cosmetics", "Cosmetics, fancy", 0],
    ["City Packaging", "Covers, boxes", 0],
  ]
  const id = {}
  for (const [name, items, openingBalance] of vendors) {
    await once("vendor " + name, () => S.createVendor(db, actor, { name, items, openingBalance, phone: "9800000" + String(Object.keys(id).length).padStart(3, "0") }))
    // a vendor with this name may already exist in the test data, so look it up
    id[name] = String((await db.collection("vendors").findOne({ nameLower: name.toLowerCase() }))._id)
  }

  const bill = async (v, no, daysAgo, amount, items) => {
    await once(`bill ${no} (${v})`, () => S.createBill(db, actor, { vendorId: id[v], billNumber: no, billDate: addDays(today, -daysAgo), amount, items }))
    const found = await db.collection("purchase_bills").findOne({ vendorId: new ObjectId(id[v]), billNumberLower: no.toLowerCase() })
    return String(found?._id)
  }
  const b = {
    lakshmi1: await bill("Sri Lakshmi Traders", "SL-1041", 12, 60000, "rice 40 bags"),
    lakshmi2: await bill("Sri Lakshmi Traders", "SL-1068", 3, 45000, "oil, pulses"),
    mega1: await bill("Mega Foods", "MF-220", 9, 32000, "snacks"),
    mega2: await bill("Mega Foods", "MF-231", 1, 18000, "biscuits"),
    anand1: await bill("Anand Textiles", "AT-88", 15, 120000, "sarees"),
    anand2: await bill("Anand Textiles", "AT-93", 2, 80000, "fabric"),
    dairy1: await bill("Fresh Dairy Co", "FD-515", 0, 9500, "curd, ghee"),
    stat1: await bill("Royal Stationery", "RS-17", 6, 14000, "pens, books"),
    cos1: await bill("Bharath Cosmetics", "BC-300", 4, 36000, "cosmetics"),
    pack1: await bill("City Packaging", "CP-9", 0, 7200, "covers"),
  }

  // cash in the purchase drawer: 100000 + 20000 + 30000 = 150000
  await once("cash received 150000", () => S.recordCashReceived(db, { denominations: { notes500: 200, notes200: 100, notes100: 300 }, receivedBy: "Ravi", from: "Admin" }))

  const P = (o) => S.recordPayment(db, actor, { paidBy: "Ravi", ...o })
  // ---- purchase counter
  await once("purchase: cash part payment, Lakshmi", () => P({ vendorId: id["Sri Lakshmi Traders"], billId: b.lakshmi1, amount: 25000, mode: "cash" }))
  await once("purchase: cash full, Dairy", () => P({ vendorId: id["Fresh Dairy Co"], billId: b.dairy1, amount: 9500, mode: "cash" }))
  await once("purchase: cash full, Packaging (Meena)", () => P({ vendorId: id["City Packaging"], billId: b.pack1, amount: 7200, mode: "cash", paidBy: "Meena" }))
  await once("purchase: cheque today (SBI), Mega", () => P({ vendorId: id["Mega Foods"], billId: b.mega1, amount: 20000, mode: "cheque", cheque: { number: "100201", bank: "SBI", chequeDate: today } }))
  await once("purchase: cheque tomorrow (HDFC), Anand", () => P({ vendorId: id["Anand Textiles"], billId: b.anand1, amount: 50000, mode: "cheque", cheque: { number: "200301", bank: "HDFC Bank", chequeDate: addDays(today, 1) } }))
  await once("purchase: cheque +4 days (SBI), Anand", () => P({ vendorId: id["Anand Textiles"], billId: b.anand1, amount: 30000, mode: "cheque", cheque: { number: "100202", bank: "SBI", chequeDate: addDays(today, 4) } }))
  await once("purchase: cheque +20 days (Canara), Lakshmi", () => P({ vendorId: id["Sri Lakshmi Traders"], billId: b.lakshmi2, amount: 25000, mode: "cheque", cheque: { number: "300401", bank: "Canara Bank", chequeDate: addDays(today, 20) } }))
  await once("purchase: cheque yesterday (HDFC), Stationery", () => P({ vendorId: id["Royal Stationery"], billId: b.stat1, amount: 8000, mode: "cheque", cheque: { number: "200302", bank: "HDFC Bank", chequeDate: addDays(today, -1) } }))
  await once("purchase: voucher, Cosmetics", () => P({ vendorId: id["Bharath Cosmetics"], billId: b.cos1, amount: 20000, mode: "voucher", voucher: { number: "V-501", promisedDate: addDays(today, 7) } }))
  await once("purchase: voucher, Mega", () => P({ vendorId: id["Mega Foods"], billId: b.mega2, amount: 10000, mode: "voucher", voucher: { number: "V-502", promisedDate: addDays(today, 2) } }))

  // ---- admin
  const A = (o) => S.recordPayment(db, actor, o, "admin")
  await once("admin: cash, Anand", () => A({ vendorId: id["Anand Textiles"], billId: b.anand2, amount: 30000, mode: "cash" }))
  await once("admin: cheque (SBI), Lakshmi", () => A({ vendorId: id["Sri Lakshmi Traders"], billId: b.lakshmi1, amount: 15000, mode: "cheque", cheque: { number: "100203", bank: "SBI", chequeDate: addDays(today, 2) } }))
  await once("admin: cheque today (HDFC), Cosmetics", () => A({ vendorId: id["Bharath Cosmetics"], billId: b.cos1, amount: 6000, mode: "cheque", cheque: { number: "200303", bank: "HDFC Bank", chequeDate: today } }))
  await once("admin: voucher, Stationery", () => A({ vendorId: id["Royal Stationery"], billId: b.stat1, amount: 3000, mode: "voucher", voucher: { number: "V-503", promisedDate: addDays(today, 5) } }))

  // clear / bounce a couple, settle one voucher
  const cheques = await db.collection("cheques").find({}).toArray()
  const byNo = (n) => cheques.find((c) => c.number === n)
  await once("cheque 100201 cleared", () => S.setChequeStatus(db, String(byNo("100201")._id), "cleared"))
  await once("cheque 200302 bounced", () => S.setChequeStatus(db, String(byNo("200302")._id), "bounced"))
  const v502 = await db.collection("vouchers").findOne({ number: "V-502" })
  await once("voucher V-502 settled in cash (purchase)", () => S.settleVoucher(db, actor, { voucherId: String(v502._id), mode: "cash", paidBy: "Meena" }))

  // ---- shop counters: only counters that already have an open, verified day today
  const entries = await db.collection("entries").find({ date: today, status: "open", openingVerified: true }).toArray()
  const counterPays = [
    ["Fresh Dairy Co", "FD-516", 4200, 2100],
    ["Royal Stationery", "RS-18", 5600, 5600],
    ["Mega Foods", "MF-240", 12000, 4000],
  ]
  if (entries.length === 0) {
    log.push("SKIPPED counter payments: no counter has an open day with verified opening cash today.")
    log.push("        Log in as a counter, verify opening cash, then run this script again.")
  }
  for (let i = 0; i < Math.min(entries.length, counterPays.length); i++) {
    const [v, no, billAmount, amount] = counterPays[i]
    await once(`counter ${entries[i].counterName}: ${v} Rs ${amount}`, () =>
      S.recordCounterVendorPayment(db, { counterName: entries[i].counterName, username: "demo" }, { vendorId: id[v], billNumber: no, billAmount, amount, items: "bought at counter" })
    )
  }
} finally {
  console.log(log.join("\n"))
  await client.close()
  fs.rmSync(out, { recursive: true, force: true })
}
