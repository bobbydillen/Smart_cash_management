import { cookies } from "next/headers"
import { getDatabase } from "./mongodb"
import { ObjectId } from "mongodb"
import type { User } from "./auth"

export async function createSession(userId: string) {
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const db = await getDatabase()
  await db.collection("sessions").insertOne({
    sessionId,
    userId: new ObjectId(userId),
    expiresAt,
    createdAt: new Date(),
  })

  const cookieStore = await cookies()
  cookieStore.set("session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  return sessionId
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("session")?.value

  if (!sessionId) {
    return null
  }

  const db = await getDatabase()
  const session = await db.collection("sessions").findOne({
    sessionId,
    expiresAt: { $gt: new Date() },
  })

  if (!session) {
    return null
  }

  const user = await db.collection<User>("users").findOne({
    _id: new ObjectId(session.userId),
  })

  return user
}

export type SerializedUser = {
  _id: string
  username: string
  role: string
  counterName?: string
  createdAt: string
}

export async function getSerializedSession(): Promise<SerializedUser | null> {
  const user = await getSession()

  if (!user) {
    return null
  }

  return {
    _id: user._id.toString(),
    username: user.username,
    role: user.role,
    counterName: user.counterName,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("session")?.value

  if (sessionId) {
    const db = await getDatabase()
    await db.collection("sessions").deleteOne({ sessionId })
  }

  cookieStore.delete("session")
}
