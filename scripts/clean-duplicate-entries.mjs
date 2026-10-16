// Removes stray EMPTY duplicate entries (same counter + date) left by an old bug,
// where two requests at the same moment each created the day.
//
// Safe by design:
//   - only an "open", completely empty duplicate is ever deleted
//   - the real entry (confirmed > submitted > open) is always kept
//   - a duplicate that holds any data is reported, never deleted
//   - dry run unless --apply is passed
//
// Run:  node --env-file=.env.local scripts/clean-duplicate-entries.mjs [--apply]
// Uses MONGODB_URI and MONGODB_DB from .env.local, so check the database name it prints.
import { MongoClient } from "mongodb"

const apply = process.argv.includes("--apply")
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "smartmart_cash"
if (!uri) {
  console.error("Set MONGODB_URI in .env.local")
  process.exit(1)
}

const rank = { confirmed: 3, submitted: 2, open: 1 }
const sum = (d) => (d ? Object.values(d).reduce((a, b) => a + (Number(b) || 0), 0) : 0)
const isEmpty = (e) =>
  e.status === "open" &&
  (e.payments || []).length === 0 &&
  !e.sales?.totalSales &&
  !e.sales?.martTotalSales &&
  !e.sales?.fashionTotalSales &&
  sum(e.closingDenominations) === 0

const client = new MongoClient(uri)
await client.connect()
const col = client.db(dbName).collection("entries")
console.log(`Database: ${dbName}   mode: ${apply ? "APPLY (will delete)" : "dry run"}`)

const groups = await col
  .aggregate([
    { $group: { _id: { c: "$counterName", d: "$date" }, ids: { $push: "$_id" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray()

let removable = 0
let kept = 0
let needsLook = 0

for (const g of groups) {
  const docs = await col.find({ _id: { $in: g.ids } }).toArray()
  docs.sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)))
  const [keep, ...rest] = docs
  kept++
  for (const extra of rest) {
    if (isEmpty(extra)) {
      removable++
      console.log(`  remove empty duplicate  ${g._id.c}  ${g._id.d}  (${extra._id})`)
      if (apply) await col.deleteOne({ _id: extra._id, status: "open" })
    } else {
      needsLook++
      console.log(`  KEEP, has data - check by hand  ${g._id.c}  ${g._id.d}  status=${extra.status} (${extra._id}); real entry is ${keep.status}`)
    }
  }
}

console.log(`\n${groups.length} duplicate day(s). ${removable} empty duplicate(s) ${apply ? "removed" : "would be removed"}, ${needsLook} need a manual look.`)
if (!apply && removable > 0) console.log("Run again with --apply to remove them.")
await client.close()
