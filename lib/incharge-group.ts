/**
 * The admin keeps two lists on the In-charges page:
 *  - "counter": the people who verify opening cash and close a shop counter's day
 *  - "purchase": the purchase counter's staff ("handled by", "closed by")
 * Names saved before the purchase list existed have no group and belong to "counter".
 */
export type InchargeGroup = "counter" | "purchase"

export const GROUP_LABEL: Record<InchargeGroup, string> = {
  counter: "Counter in-charges",
  purchase: "Purchase staff",
}

/** MongoDB filter for one list. */
export const groupFilter = (group: InchargeGroup) =>
  group === "purchase" ? { group: "purchase" } : { group: { $ne: "purchase" } }
