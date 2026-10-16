import bcrypt from "bcryptjs"
import { getDatabase } from "./mongodb"
import type { ObjectId } from "mongodb"

/**
 * ✅ EXTENDED ROLES (BACKWARD COMPATIBLE)
 */
export type UserRole = "admin" | "supervisor" | "counter" | "purchase"

export interface User {
  _id: ObjectId
  username: string
  password: string
  role: UserRole
  counterName?: string
  createdAt: Date
}

/* ---------------- PASSWORD HELPERS ---------------- */

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword)
}

/* ---------------- AUTHENTICATION ---------------- */

// a real-looking hash, compared against when the username does not exist so
// that a wrong username and a wrong password take the same time to reject
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10)

export async function authenticateUser(
  username: string,
  password: string
): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection<User>("users").findOne({ username })

  if (!user) {
    await verifyPassword(password, DUMMY_HASH)
    return null
  }

  const isValid = await verifyPassword(password, user.password)
  if (!isValid) return null

  return user
}

/* ---------------- USER INITIALIZATION ---------------- */
/**
 * ⚠️ PRODUCTION-SAFE INITIALIZER
 *
 * - Ensures supervisor exists (adds only if missing)
 * - Seeds admin + counters ONLY on fresh DB
 * - Never modifies existing users
 */
export async function initializeUsers() {
  const db = await getDatabase()
  const usersCollection = db.collection<User>("users")

  /* ---------- ENSURE SUPERVISOR EXISTS (SAFE) ---------- */
  const supervisorExists = await usersCollection.findOne({
    username: "supervisor",
  })

  if (!supervisorExists) {
    const supervisorPassword = await hashPassword("supervisor")

    await usersCollection.insertOne({
      username: "supervisor",
      password: supervisorPassword,
      role: "supervisor",
      createdAt: new Date(),
    } as any)
  }

  /* ---------- ENSURE PURCHASE USER EXISTS (SAFE) ---------- */
  // Created with a random password nobody knows: the admin sets a real one
  // from the Passwords page before anyone logs in.
  const purchaseExists = await usersCollection.findOne({ username: "purchase" })

  if (!purchaseExists) {
    const purchasePassword = await hashPassword(
      crypto.randomUUID() + crypto.randomUUID()
    )

    await usersCollection.insertOne({
      username: "purchase",
      password: purchasePassword,
      role: "purchase",
      createdAt: new Date(),
    } as any)
  }

  /* ---------- SEED ONLY IF DB IS EMPTY ---------- */
  const existingUsers = await usersCollection.countDocuments()
  if (existingUsers > 0) {
    return
  }

  const counters = [
    { username: "mart1", counterName: "Smart Mart Counter 1" },
    { username: "mart2", counterName: "Smart Mart Counter 2" },
    { username: "martfancy", counterName: "Smart Mart Fancy" },
    { username: "fashion", counterName: "Smart Fashion (Both)" },
  ]

  const defaultPassword = await hashPassword("1234")
  const adminPassword = await hashPassword("admin")

  const users: Omit<User, "_id">[] = [
    // ✅ ADMIN
    {
      username: "admin",
      password: adminPassword,
      role: "admin",
      createdAt: new Date(),
    },

    // ✅ COUNTERS
    ...counters.map((counter) => ({
      username: counter.username,
      password: defaultPassword,
      role: "counter" as UserRole,
      counterName: counter.counterName,
      createdAt: new Date(),
    })),
  ]

  await usersCollection.insertMany(users as any)
}
