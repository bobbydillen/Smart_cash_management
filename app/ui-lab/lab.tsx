"use client"

import { useState } from "react"
import { AdminA, ClosingA, CounterA } from "./mocks-a"
import { AdminB, ClosingB, CounterB } from "./mocks-b"
import { AdminC, ClosingC, CounterC } from "./mocks-c"

const SCREENS = [
  { id: "counter", label: "Counter dashboard" },
  { id: "closing", label: "Closing page" },
  { id: "admin", label: "Admin dashboard" },
] as const
const DIRECTIONS = [
  { id: "A", name: "Ledger", line: "One continuous page. Neutral chrome, a near-black action, colour only on numbers and status. A totals strip stays at the bottom while you count." },
  { id: "B", name: "Framed sheet", line: "An app shell: sidebar on desktop, bottom tabs on phones. Counting uses a 2-column grid of denomination cards (about half the scrolling)." },
  { id: "C", name: "Guided", line: "The day is a checklist with one current step and visible locks. Counting uses a number keypad. The admin starts with a queue of decisions." },
] as const
const WIDTHS = [
  { id: 390, label: "Phone 390" },
  { id: 768, label: "Tablet 768" },
  { id: 1180, label: "Desktop 1180" },
] as const

const MOCKS = {
  A: { counter: CounterA, closing: ClosingA, admin: AdminA },
  B: { counter: CounterB, closing: ClosingB, admin: AdminB },
  C: { counter: CounterC, closing: ClosingC, admin: AdminC },
}

const btn = (on: boolean) =>
  `h-10 rounded-lg border px-3 text-sm font-medium ${on ? "border-foreground bg-foreground text-background" : "bg-card text-foreground hover:bg-secondary"}`

export default function Lab() {
  const [screen, setScreen] = useState<(typeof SCREENS)[number]["id"]>("counter")
  const [dir, setDir] = useState<"A" | "B" | "C">("A")
  const [width, setWidth] = useState<number>(390)
  const Mock = MOCKS[dir][screen]
  const d = DIRECTIONS.find((x) => x.id === dir)!

  return (
    <div className="min-h-screen bg-secondary/40 p-4 text-foreground">
      <div className="mx-auto max-w-[1240px] space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Design directions (preview only)</h1>
          <p className="text-sm text-muted-foreground">Same data, same tokens. Pick a screen, a direction and a width. Nothing here is saved or connected.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Screen">{SCREENS.map((s) => <button key={s.id} className={btn(screen === s.id)} onClick={() => setScreen(s.id)}>{s.label}</button>)}</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">{DIRECTIONS.map((x) => <button key={x.id} className={btn(dir === x.id)} onClick={() => setDir(x.id)}>{x.id} · {x.name}</button>)}</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Width">{WIDTHS.map((w) => <button key={w.id} className={btn(width === w.id)} onClick={() => setWidth(w.id)}>{w.label}</button>)}</div>
        <p className="max-w-3xl text-sm"><b>{d.id} · {d.name}.</b> {d.line}</p>

        <div className="overflow-x-auto pb-4">
          <div className="@container mx-auto overflow-hidden rounded-2xl border bg-background shadow-sm" style={{ width }}>
            <Mock />
          </div>
        </div>
      </div>
    </div>
  )
}
