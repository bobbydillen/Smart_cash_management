"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Modal from "@/components/modal"
import { DenomRow, GroupLabel } from "@/components/denom-row"
import { Field, FormError, InchargeSelect, MoneyField } from "./common"
import { addCashReceived, addMoneyMove } from "@/app/actions/purchase"
import { COIN_KEYS, DENOMS, NOTE_KEYS, emptyDenoms } from "@/lib/next-day"
import { calculateClosingCash } from "@/lib/types"
import { inr } from "@/lib/report"

/** Cash handed straight to the purchase staff, entered note by note. */
export function CashReceivedForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState(emptyDenoms())
  const [from, setFrom] = useState("")
  const [note, setNote] = useState("")
  const [by, setBy] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const total = calculateClosingCash(counts)
  const ready = total > 0 && !!by

  const save = async () => {
    setError("")
    setBusy(true)
    const res = await addCashReceived({ from, denominations: counts, note, receivedBy: by })
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  const rows = (keys: readonly string[]) =>
    DENOMS.filter((d) => keys.includes(d[1])).map(([label, key, value]) => (
      <DenomRow
        key={key}
        label={label}
        count={counts[key]}
        amount={counts[key] * value}
        onSet={(n) => setCounts((c) => ({ ...c, [key]: n }))}
      />
    ))

  return (
    <Modal title="Cash received" subtitle="Cash handed to you directly. Count it note by note." onClose={onClose}>
      <div className="space-y-4">
        <InchargeSelect value={by} onChange={setBy} label="Received by" />
        <Field label="Received from" hint="Leave empty if it was the admin">
          <Input value={from} maxLength={60} placeholder="Admin" onChange={(e) => setFrom(e.target.value)} />
        </Field>

        <div>
          <GroupLabel>Notes</GroupLabel>
          <div className="space-y-2">{rows(NOTE_KEYS)}</div>
          <GroupLabel>Coins</GroupLabel>
          <div className="space-y-2">{rows(COIN_KEYS)}</div>
        </div>

        <Field label="Note">
          <Input value={note} maxLength={200} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-success-soft px-4 py-3">
          <span className="text-sm text-muted-foreground">Total received</span>
          <span className="text-xl font-semibold text-success">₹{inr(total)}</span>
        </div>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!ready || busy} onClick={save}>
            {busy ? "Saving…" : "Save cash received"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Any other money in or out of the drawer, with the reason. */
export function MoneyMoveForm({
  direction,
  onClose,
  onDone,
}: {
  direction: "in" | "out"
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [by, setBy] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const isIn = direction === "in"
  const ready = Number(amount) > 0 && !!reason.trim() && !!by

  const save = async () => {
    setError("")
    setBusy(true)
    const res = await addMoneyMove(direction, { amount, reason, by })
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  return (
    <Modal
      title={isIn ? "Money in" : "Money out"}
      subtitle={isIn ? "Other money that came into the drawer" : "Other money paid from the drawer (not a vendor payment)"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <InchargeSelect value={by} onChange={setBy} label="Handled by" />
        <Field label="Amount" required>
          <MoneyField value={amount} onChange={setAmount} />
        </Field>
        <Field label={isIn ? "Where it came from" : "What it was for"} required>
          <Input
            value={reason}
            maxLength={120}
            placeholder={isIn ? "e.g. Refund from a supplier" : "e.g. Transport, tea, packing"}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!ready || busy} onClick={save}>
            {busy ? "Saving…" : isIn ? "Save money in" : "Save money out"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
