"use client"

import { useSyncExternalStore } from "react"

/**
 * "A page change is in progress." The pages load their data on the server, so after a tap the old
 * page stays on screen until the new one is ready. This tiny store lets the progress bar, the tapped
 * tab and the dimmed page all react the instant something is tapped.
 */
let navigating = false
let safety: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

export function navStart() {
  if (!navigating) {
    navigating = true
    emit()
  }
  // never leave the page looking busy for ever (a failed navigation, a cancelled load)
  clearTimeout(safety)
  safety = setTimeout(navDone, 20000)
}

export function navDone() {
  clearTimeout(safety)
  if (navigating) {
    navigating = false
    emit()
  }
}

export function useNavigating() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => navigating,
    () => false
  )
}
