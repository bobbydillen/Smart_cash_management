"use server"

import { authenticateUser, initializeUsers } from "@/lib/auth"
import { createSession, deleteSession } from "@/lib/session"
import { redirect } from "next/navigation"

export async function login(username: string, password: string) {
  await initializeUsers()

  const user = await authenticateUser(username, password)

  if (!user) {
    return { error: "Invalid username or password" }
  }

  await createSession(user._id.toString())

  if (user.role === "admin") {
    redirect("/admin")
  } else {
    redirect("/counter")
  }
}

export async function logout() {
  await deleteSession()
  redirect("/")
}
