"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import { hashPassword, verifyPassword } from "@/lib/auth"
import { ObjectId } from "mongodb"
import type { User } from "@/lib/auth"

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const session = await getSession()
  if (!session) {
    return { error: "Unauthorized" }
  }

  // Admin can change anyone's password, counters can only change their own
  if (session.role !== "admin" && session._id.toString() !== userId) {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const user = await db.collection<User>("users").findOne({ _id: new ObjectId(userId) })

  if (!user) {
    return { error: "User not found" }
  }

  // If not admin, verify current password
  if (session.role !== "admin") {
    const isValid = await verifyPassword(currentPassword, user.password)
    if (!isValid) {
      return { error: "Current password is incorrect" }
    }
  }

  const hashedPassword = await hashPassword(newPassword)

  await db.collection<User>("users").updateOne({ _id: new ObjectId(userId) }, { $set: { password: hashedPassword } })

  return { success: true }
}

export async function getAllUsers() {
  const session = await getSession()
  if (!session || session.role !== "admin") {
    return { error: "Unauthorized" }
  }

  const db = await getDatabase()
  const users = await db
    .collection<User>("users")
    .find({})
    .project({ password: 0 }) // Don't send passwords
    .toArray()

  return {
    users: users.map((u) => ({
      _id: u._id.toString(),
      username: u.username,
      role: u.role,
      counterName: u.counterName,
    })),
  }
}
