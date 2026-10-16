"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import { parseObjectId } from "@/lib/entries"
import { groupFilter, type InchargeGroup } from "@/lib/incharge-group"

export interface Incharge {
  _id: string
  name: string
  active: boolean
  group: InchargeGroup
}

function serialize(doc: any): Incharge {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    active: doc.active !== false,
    group: doc.group === "purchase" ? "purchase" : "counter",
  }
}

/**
 * Names offered in a dropdown.
 *  - a counter always gets the counter in-charges
 *  - the purchase counter always gets the purchase staff
 *  - the admin can ask for either (counter in-charges by default)
 */
export async function getActiveIncharges(group: InchargeGroup = "counter"): Promise<Incharge[]> {
  const user = await getSession()
  if (!user || (user.role !== "counter" && user.role !== "purchase" && user.role !== "admin")) return []

  const wanted: InchargeGroup =
    user.role === "purchase" ? "purchase" : user.role === "counter" ? "counter" : group === "purchase" ? "purchase" : "counter"

  const db = await getDatabase()
  const docs = await db
    .collection("incharges")
    .find({ active: true, ...groupFilter(wanted) })
    .sort({ name: 1 })
    .toArray()
  return docs.map(serialize)
}

/* Full list of both groups, including removed names (admin page) */
export async function getAllIncharges(): Promise<Incharge[]> {
  const user = await getSession()
  if (!user || user.role !== "admin") return []

  const db = await getDatabase()
  const docs = await db.collection("incharges").find({}).sort({ name: 1 }).toArray()
  return docs.map(serialize)
}

export async function addIncharge(name: string, group: InchargeGroup = "counter") {
  const user = await getSession()
  if (!user || user.role !== "admin") return { error: "Unauthorized" }
  if (group !== "counter" && group !== "purchase") return { error: "Invalid list" }

  const clean = (name || "").trim().replace(/\s+/g, " ")
  if (!clean) return { error: "Enter a name" }
  if (clean.length > 60) return { error: "Name is too long" }

  const db = await getDatabase()
  // the same name is only a duplicate within the same list
  const existing = await db.collection("incharges").findOne({
    name: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    ...groupFilter(group),
  })

  if (existing) {
    if (existing.active !== false) return { error: "This name is already in the list" }
    // re-activate a previously removed name
    await db.collection("incharges").updateOne({ _id: existing._id }, { $set: { active: true } })
    return { success: true }
  }

  await db.collection("incharges").insertOne({
    name: clean,
    group,
    active: true,
    createdAt: new Date(),
    createdBy: user.username,
  })
  return { success: true }
}

/* Removed names are only deactivated, so past records keep their name */
export async function setInchargeActive(id: string, active: boolean) {
  const user = await getSession()
  if (!user || user.role !== "admin") return { error: "Unauthorized" }

  const _id = parseObjectId(id)
  if (!_id) return { error: "Invalid in-charge" }

  const db = await getDatabase()
  await db.collection("incharges").updateOne({ _id }, { $set: { active: !!active } })
  return { success: true }
}
