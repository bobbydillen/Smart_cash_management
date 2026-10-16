"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { getActiveIncharges, type Incharge } from "@/app/actions/incharge"
import { addBank, loadBanks } from "@/app/actions/purchase"
import { Button } from "@/components/ui/button"
import type { Bank } from "@/lib/purchase"
import { MODE_LABEL, type PayMode, type PaymentSource } from "@/lib/purchase"
import StatusChip, { type Tone } from "@/components/status-chip"

/** A labelled form row. */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Rupee amount input. */
export function MoneyField({
  value,
  onChange,
  placeholder = "0.00",
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        className="pl-7"
      />
    </div>
  )
}

export const selectClass =
  "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"

/** Who is handling this: chosen from the in-charges the admin set up. */
export function InchargeSelect({
  value,
  onChange,
  label = "Handled by",
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const [names, setNames] = useState<Incharge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveIncharges("purchase").then((list) => {
      setNames(list)
      setLoading(false)
    })
  }, [])

  return (
    <Field label={label} required>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
        <option value="">{loading ? "Loading…" : "Select in-charge"}</option>
        {names.map((n) => (
          <option key={n._id} value={n.name}>
            {n.name}
          </option>
        ))}
      </select>
      {!loading && names.length === 0 && (
        <p className="mt-1 text-xs text-danger">
          No purchase staff are set up. Ask the admin to add names under In-charges → Purchase staff.
        </p>
      )}
    </Field>
  )
}

/** The bank a cheque is drawn on: picked from the list, with a quick way to add a new one. */
export function BankSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const reload = () => loadBanks().then((list) => {
    setBanks(list.filter((b) => b.active))
    setLoading(false)
    return list
  })
  useEffect(() => {
    reload()
  }, [])

  const create = async () => {
    setError("")
    setBusy(true)
    const res = await addBank(newName)
    setBusy(false)
    if (res.error) return setError(res.error)
    const list = await reload()
    const made = list.find((b) => b.name.toLowerCase() === newName.trim().replace(/\s+/g, " ").toLowerCase())
    if (made) onChange(made.name)
    setNewName("")
    setAdding(false)
  }

  return (
    <Field label="Bank" required>
      <select
        className={selectClass}
        value={adding ? "__new__" : value}
        disabled={loading}
        onChange={(e) => {
          if (e.target.value === "__new__") setAdding(true)
          else {
            setAdding(false)
            onChange(e.target.value)
          }
        }}
      >
        <option value="">{loading ? "Loading…" : "Select bank"}</option>
        {banks.map((b) => (
          <option key={b._id} value={b.name}>
            {b.name}
          </option>
        ))}
        <option value="__new__">+ Add a new bank…</option>
      </select>
      {adding && (
        <div className="mt-2 flex gap-2">
          <Input placeholder="Bank name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Button type="button" onClick={create} disabled={busy || !newName.trim()}>
            Add
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </Field>
  )
}

/** Cash / Cheque / Voucher switch. */
export function ModeSwitch({
  value,
  onChange,
  modes = ["cash", "cheque", "voucher"],
}: {
  value: PayMode
  onChange: (m: PayMode) => void
  modes?: PayMode[]
}) {
  return (
    <div className={`grid gap-1 rounded-lg border bg-card p-1`} style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${
            value === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

const MODE_TONE: Record<PayMode, Tone> = { cash: "success", cheque: "info", voucher: "warning" }

export function ModeChip({ mode }: { mode: PayMode }) {
  return (
    <StatusChip tone={MODE_TONE[mode]} dot={false}>
      {MODE_LABEL[mode]}
    </StatusChip>
  )
}

/** Who paid. Nothing is shown for the purchase counter, which is the usual case. */
export function SourceChip({ source, name }: { source?: PaymentSource; name?: string }) {
  if (!source || source === "purchase") return null
  return (
    <StatusChip tone={source === "admin" ? "info" : "neutral"} dot={false}>
      {source === "admin" ? "Paid by admin" : `Paid by ${name ?? "counter"}`}
    </StatusChip>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>
}

/** "2 days ago", "in 3 days", "today" for a YYYY-MM-DD date. */
export function daysFrom(date: string, today: string): number {
  const a = Date.parse(date + "T00:00:00Z")
  const b = Date.parse(today + "T00:00:00Z")
  return Math.round((a - b) / 86_400_000)
}

export function relativeDay(date: string, today: string): string {
  const d = daysFrom(date, today)
  if (d === 0) return "today"
  if (d === 1) return "tomorrow"
  if (d === -1) return "yesterday"
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}
