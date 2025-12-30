import bcrypt from "bcryptjs"
import { getDatabase } from "./mongodb"
import type { ObjectId } from "mongodb"

export type UserRole = "admin" | "counter"

export interface User {
  _id: ObjectId
  username: string
  password: string
  role: UserRole
  counterName?: string
  createdAt: Date
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword)
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection<User>("users").findOne({ username })

  if (!user) {
    return null
  }

  const isValid = await verifyPassword(password, user.password)
  if (!isValid) {
    return null
  }

  return user
}

export async function initializeUsers() {
  const db = await getDatabase()
  const usersCollection = db.collection<User>("users")

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
    {
      username: "admin",
      password: adminPassword,
      role: "admin",
      createdAt: new Date(),
    },
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
