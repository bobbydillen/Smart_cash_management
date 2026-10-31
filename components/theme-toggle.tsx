"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

/**
 * Light / dark, remembered in this browser. Until someone chooses, the device setting decides
 * (the inline script in app/layout.tsx applies it before the first paint, so there is no flash).
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  )
}
