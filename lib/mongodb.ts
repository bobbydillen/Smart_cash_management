import { MongoClient, type Db } from "mongodb"

let clientPromise: Promise<MongoClient> | null = null
let indexesReady: Promise<void> | null = null

function getClientPromise(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error("Please add your MongoDB URI to .env.local")
  }

  if (clientPromise) {
    return clientPromise
  }

  const uri = process.env.MONGODB_URI
  const options = {}

  if (process.env.NODE_ENV === "development") {
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>
    }

    if (!globalWithMongo._mongoClientPromise) {
      const client = new MongoClient(uri, options)
      globalWithMongo._mongoClientPromise = client.connect()
    }
    clientPromise = globalWithMongo._mongoClientPromise
  } else {
    const client = new MongoClient(uri, options)
    clientPromise = client.connect()
  }

  return clientPromise
}

/**
 * Indexes the app relies on, created once per server process.
 * A failure here is logged but never stops the app: it only means a safeguard
 * or a speed-up is missing.
 */
async function ensureIndexes(db: Db) {
  const tryIndex = async (
    collection: string,
    keys: Record<string, 1 | -1>,
    options: Record<string, unknown>
  ) => {
    try {
      await db.collection(collection).createIndex(keys, options)
      return true
    } catch (e) {
      console.warn(`[db] could not create index ${collection}.${String(options.name)}:`, (e as Error).message)
      return false
    }
  }

  // one entry per counter per day. If old duplicates still exist this cannot be
  // built; run scripts/clean-duplicate-entries.mjs, then restart.
  const uniqueOptions = { unique: true, name: "entries_counter_date_unique" }
  let unique = await tryIndex("entries", { counterName: 1, date: 1 }, uniqueOptions)
  if (!unique) {
    // a plain index on the same fields (the fallback below, from an earlier run) blocks
    // the unique one; drop it and try again
    try {
      await db.collection("entries").dropIndex("entries_counter_date")
      unique = await tryIndex("entries", { counterName: 1, date: 1 }, uniqueOptions)
    } catch {
      /* no plain index to drop */
    }
  }
  if (!unique) {
    await tryIndex("entries", { counterName: 1, date: 1 }, { name: "entries_counter_date" })
  }
  await tryIndex("entries", { date: 1 }, { name: "entries_date" })

  await tryIndex("users", { username: 1 }, { unique: true, name: "users_username_unique" })

  // sessions expire by themselves when expiresAt passes
  await tryIndex("sessions", { sessionId: 1 }, { unique: true, name: "sessions_id_unique" })
  await tryIndex("sessions", { expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_ttl" })

  await tryIndex("incharges", { name: 1 }, { name: "incharges_name" })

  await tryIndex("transfers", { to: 1, status: 1 }, { name: "transfers_to_status" })
  await tryIndex("transfers", { from: 1, date: 1 }, { name: "transfers_from_date" })
  await tryIndex("transfers", { date: 1 }, { name: "transfers_date" })

  // purchase counter
  await tryIndex("vendors", { nameLower: 1 }, { unique: true, name: "vendors_name_unique" })
  await tryIndex("purchase_bills", { vendorId: 1, billNumberLower: 1 }, { unique: true, name: "bills_vendor_number_unique" })
  await tryIndex("purchase_bills", { vendorId: 1, billDate: -1 }, { name: "bills_vendor_date" })
  await tryIndex("purchase_payments", { vendorId: 1, date: -1 }, { name: "pay_vendor_date" })
  await tryIndex("purchase_payments", { date: 1 }, { name: "pay_date" })
  await tryIndex("cheques", { status: 1, chequeDate: 1 }, { name: "cheques_status_date" })
  await tryIndex("cheques", { vendorId: 1 }, { name: "cheques_vendor" })
  await tryIndex("banks", { nameLower: 1 }, { unique: true, name: "banks_name_unique" })
  await tryIndex("vouchers", { numberLower: 1 }, { unique: true, name: "vouchers_number_unique" })
  await tryIndex("vouchers", { status: 1, vendorId: 1 }, { name: "vouchers_status_vendor" })
  await tryIndex("purchase_days", { date: 1 }, { unique: true, name: "purchase_days_date_unique" })

  // failed-login counters clean themselves up
  await tryIndex("login_attempts", { key: 1 }, { unique: true, name: "login_attempts_key" })
  await tryIndex("login_attempts", { expireAt: 1 }, { expireAfterSeconds: 0, name: "login_attempts_ttl" })
}

export async function getDatabase(): Promise<Db> {
  const client = await getClientPromise()
  const db = client.db(process.env.MONGODB_DB || "smartmart_cash")

  if (!indexesReady) indexesReady = ensureIndexes(db)
  await indexesReady

  return db
}

export default getClientPromise
