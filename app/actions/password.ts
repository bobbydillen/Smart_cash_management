"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import { cookies } from "next/headers"
import { hashPassword, verifyPassword } from "@/lib/auth"
import { parseObjectId } from "@/lib/entries"
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation"
import { fail, ok } from "@/lib/action-result"
import type { User } from "@/lib/auth"

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const session = await getSession()
  if (!session) return fail("Unauthorized")

  const _id = parseObjectId(userId)
  if (!_id) return fail("User not found")

  // Admin can change anyone's password; everyone else only their own
  if (session.role !== "admin" && session._id.toString() !== userId) {
    return fail("Unauthorized")
  }

  if (
    typeof newPassword !== "string" ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return fail(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`)
  }

  const db = await getDatabase()
  const user = await db.collection<User>("users").findOne({ _id })
  if (!user) return fail("User not found")

  // anyone who is not an admin must prove they know the current password
  if (session.role !== "admin") {
    const isValid = await verifyPassword(String(currentPassword ?? ""), user.password)
    if (!isValid) return fail("Current password is incorrect")
  }

  const hashedPassword = await hashPassword(newPassword)
  await db.collection<User>("users").updateOne({ _id }, { $set: { password: hashedPassword } })

  // a changed password signs that account out everywhere, except the screen
  // the person changing their own password is using
  const sessions = db.collection("sessions")
  if (session._id.toString() === userId) {
    const current = (await cookies()).get("session")?.value
    await sessions.deleteMany({ userId: _id, sessionId: { $ne: current } })
  } else {
    await sessions.deleteMany({ userId: _id })
  }

  return ok()
}

export async function getAllUsers() {
  const session = await getSession()
  if (!session || session.role !== "admin") return fail("Unauthorized")

  const db = await getDatabase()
  const users = await db
    .collection<User>("users")
    .find({}, { projection: { password: 0 } })
    .toArray()

  return ok({
    users: users.map((u) => ({
      _id: u._id.toString(),
      username: u.username,
      role: u.role,
      counterName: u.counterName,
    })),
  })
}
