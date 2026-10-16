"use server"

import { authenticateUser, initializeUsers } from "@/lib/auth"
import { createSession, deleteSession } from "@/lib/session"
import { getDatabase } from "@/lib/mongodb"
import { fail } from "@/lib/action-result"
import { redirect } from "next/navigation"

/** Five wrong passwords lock that account's sign-in for 15 minutes. */
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export async function login(username: string, password: string) {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 50 ||
    password.length > 200
  ) {
    return fail("Invalid username or password")
  }

  const db = await getDatabase()
  const attempts = db.collection("login_attempts")
  const key = username.trim().toLowerCase()
  const now = new Date()

  const record = await attempts.findOne({ key })
  if (record?.lockedUntil && record.lockedUntil > now) {
    const minutes = Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 60000)
    return fail(`Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`)
  }

  await initializeUsers()

  const user = await authenticateUser(username, password)

  if (!user) {
    // count the failure; the record removes itself after the lock period
    const updated = await attempts.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $set: { expireAt: new Date(now.getTime() + LOCK_MINUTES * 60000) },
      },
      { upsert: true, returnDocument: "after" }
    )
    if (updated && updated.count >= MAX_ATTEMPTS) {
      await attempts.updateOne(
        { key },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) } }
      )
    }
    return fail("Invalid username or password")
  }

  await attempts.deleteOne({ key })
  await createSession(user._id.toString())

  if (user.role === "admin") redirect("/admin")
  if (user.role === "supervisor") redirect("/supervisor")
  if (user.role === "purchase") redirect("/purchase")
  redirect("/counter")
}

export async function logout() {
  await deleteSession()
  redirect("/")
}
