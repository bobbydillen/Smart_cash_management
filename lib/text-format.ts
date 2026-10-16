/**
 * Tidies names typed in any mix of capitals: every word starts with a capital letter.
 *
 *   "smart mart"        -> "Smart Mart"
 *   "SRI LAKSHMI TRADERS" -> "Sri Lakshmi Traders"
 *   "SmartMart"         -> "SmartMart"   (a word typed with its own capitals is left alone)
 *   "12/3, main road"   -> "12/3, Main Road"
 *   "1st floor"         -> "1st Floor"   (letters right after a digit are left as they are)
 *   "K S RAMAN"         -> "K S Raman"   (single letters and two-letter initials stay capital)
 */
export function properCase(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.replace(/\p{L}[\p{L}']*/gu, (word, offset: number, whole: string) => {
    // "1st", "2nd", "5th": the letters belong to the number
    if (offset > 0 && /\d/.test(whole[offset - 1])) return word

    const lower = word.toLowerCase()
    const upper = word.toUpperCase()
    if (word === lower || word === upper) {
      // a short all-capital word is almost always initials (K S Raman, RK Traders)
      if (word === upper && word.replace(/'/g, "").length <= 2) return word
      return upper[0] + lower.slice(1)
    }
    // mixed capitals (SmartMart, McDonald): keep as typed, only make sure it starts with a capital
    return upper[0] + word.slice(1)
  })
}

/**
 * A name reduced to its letters and digits, so "Sri Lakshmi", "SRI-LAKSHMI" and "srilakshmi"
 * are recognised as the same vendor.
 */
export const nameKey = (value: unknown): string =>
  typeof value === "string" ? value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") : ""
