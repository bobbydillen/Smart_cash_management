"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { navDone, navStart, useNavigating } from "@/lib/nav-state"

/**
 * A thin progress bar across the top of the screen while a page is loading, plus a hidden status
 * message for screen readers. It starts the moment any internal link is tapped (or navStart() is
 * called for a button that navigates) and ends when the new page has arrived.
 */
function Inner() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const navigating = useNavigating()
  const first = useRef(true)

  // the new page has arrived
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    navDone()
  }, [pathname, search])

  // any tap on an internal link starts it
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      if (url.pathname === location.pathname && url.search === location.search) return // same page, or only a #hash
      navStart()
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  // a bar that climbs quickly, slows down, and waits for the page
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!navigating) {
      setWidth(0)
      return
    }
    setWidth(12)
    const steps = [35, 60, 78, 88, 94]
    const timers = steps.map((w, i) => setTimeout(() => setWidth(w), 250 + i * 600))
    return () => timers.forEach(clearTimeout)
  }, [navigating])

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1">
        <div
          className={`h-full rounded-r-full bg-primary transition-[width,opacity] ease-out ${navigating ? "opacity-100 duration-500" : "opacity-0 duration-200"}`}
          style={{ width: navigating ? `${width}%` : "100%" }}
        />
      </div>
      <p role="status" className="sr-only">
        {navigating ? "Loading page…" : ""}
      </p>
    </>
  )
}

export default function NavProgress() {
  // useSearchParams must sit under Suspense
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
