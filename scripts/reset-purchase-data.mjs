// Deletes ALL purchase-counter data (vendors, bills, payments, cheques, vouchers, daily
// cash sessions) so a test database can start fresh. Counters, users, entries and
// transfers are NOT touched.
//
// Safe by design: dry run unless --apply, and it refuses the default live database name.
//
// Run:  node --env-file=.env.local scripts/reset-purchase-data.mjs [--apply]
import { MongoClient } from "mongodb"

const apply = process.argv.includes("--apply")
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "smartmart_cash"
if (!uri) {
  console.error("Set MONGODB_URI in .env.local")
  process.exit(1)
}
if (dbName === "smartmart_cash") {
  console.error('Refusing to touch "smartmart_cash" (the live database). Point MONGODB_DB at a test copy.')
  process.exit(1)
}

const COLLECTIONS = ["vendors", "purchase_bills", "purchase_payments", "purchase_returns", "cheques", "vouchers", "purchase_days"]
const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)
console.log(`Database: ${dbName}   mode: ${apply ? "APPLY (will delete)" : "dry run"}`)

for (const name of COLLECTIONS) {
  const n = await db.collection(name).countDocuments()
  console.log(`  ${name}: ${n} document(s)`)
  if (apply && n > 0) await db.collection(name).deleteMany({})
}
if (!apply) console.log("\nRun again with --apply to delete them.")
await client.close()
