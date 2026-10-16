// Copies users + entries from the OLD database into a NEW database on the same cluster.
// The old database is only READ. Sessions are skipped (everyone just logs in again).
//
// .env.local needs:
//   MONGODB_URI=<cluster uri>        (same one the live app uses)
//   SOURCE_DB=smartmart_cash          (optional, default shown)
//   TARGET_DB=smartmart_cash_v2       (the new database name)
//
// Run:  node --env-file=.env.local scripts/copy-db.mjs [--force]
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const sourceName = process.env.SOURCE_DB || "smartmart_cash"
const targetName = process.env.TARGET_DB
const force = process.argv.includes("--force")
const COLLECTIONS = ["users", "entries"]

if (!uri || !targetName) {
  console.error("Set MONGODB_URI and TARGET_DB in .env.local")
  process.exit(1)
}
if (targetName === sourceName) {
  console.error("TARGET_DB must differ from SOURCE_DB - refusing to continue")
  process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const src = client.db(sourceName)
const dst = client.db(targetName)

for (const name of COLLECTIONS) {
  const existing = await dst.collection(name).countDocuments()
  if (existing > 0 && !force) {
    console.error(`${targetName}.${name} already has ${existing} docs. Re-run with --force to replace it.`)
    process.exit(1)
  }
}

for (const name of COLLECTIONS) {
  const docs = await src.collection(name).find({}).toArray()
  await dst.collection(name).deleteMany({})
  if (docs.length) await dst.collection(name).insertMany(docs, { ordered: false })

  // copy indexes (skip the default _id index)
  for (const idx of await src.collection(name).indexes()) {
    if (idx.name === "_id_") continue
    const { key, v, ns, ...opts } = idx
    await dst.collection(name).createIndex(key, opts)
  }

  const after = await dst.collection(name).countDocuments()
  console.log(`${name}: source ${docs.length} -> target ${after} ${docs.length === after ? "OK" : "MISMATCH"}`)
}

await client.close()
