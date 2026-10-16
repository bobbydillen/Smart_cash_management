"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Modal from "@/components/modal"
import { BankSelect, Field, FormError, InchargeSelect, ModeSwitch, MoneyField, selectClass } from "./common"
import {
  addBill,
  addVendor,
  editBill,
  editVendor,
  loadVendorDetail,
  loadVendors,
  makePayment,
  makeReturn,
  settleVoucher,
} from "@/app/actions/purchase"
import { RETURN_REASONS, type BillWithStatus, type PayMode, type Vendor, type Voucher } from "@/lib/purchase"
import type { VendorDetail, VendorRow } from "@/lib/purchase-service"
import { inr, todayIST } from "@/lib/report"
import { nameKey, properCase } from "@/lib/text-format"

const NEW_BILL = "__new"

const textarea =
  "w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/* ================= VENDOR ================= */

export function VendorForm({
  vendor,
  onClose,
  onDone,
}: {
  vendor?: Vendor
  onClose: () => void
  onDone: (vendorId?: string) => void
}) {
  const [name, setName] = useState(vendor?.name ?? "")
  const [phone, setPhone] = useState(vendor?.phone ?? "")
  const [contactPerson, setContactPerson] = useState(vendor?.contactPerson ?? "")
  const [items, setItems] = useState(vendor?.items ?? "")
  const [address, setAddress] = useState(vendor?.address ?? "")
  const [gstin, setGstin] = useState(vendor?.gstin ?? "")
  const [opening, setOpening] = useState(vendor ? String(vendor.openingBalance || "") : "")
  const [notes, setNotes] = useState(vendor?.notes ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  // when adding, show vendors that already look like the name being typed
  const [existing, setExisting] = useState<VendorRow[]>([])
  useEffect(() => {
    if (!vendor) loadVendors().then(setExisting)
  }, [vendor])

  const typedKey = nameKey(name)
  const similar = useMemo(() => {
    if (vendor || typedKey.length < 2) return []
    return existing
      .filter((v) => {
        const k = nameKey(v.name)
        return k.includes(typedKey) || (k.length >= 3 && typedKey.includes(k))
      })
      .slice(0, 5)
  }, [existing, typedKey, vendor])
  const sameName = similar.find((v) => nameKey(v.name) === typedKey)

  const save = async () => {
    setError("")
    setBusy(true)
    const input = { name, phone, contactPerson, items, address, gstin, notes, openingBalance: opening }
    const res = vendor ? await editVendor(vendor._id, input) : await addVendor(input)
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone("vendorId" in res ? (res.vendorId as string) : vendor?._id)
  }

  return (
    <Modal title={vendor ? "Edit vendor" : "Add vendor"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Vendor name" required>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => setName((v) => properCase(v))} autoFocus />
        </Field>
        {similar.length > 0 && (
          <div className={`rounded-xl border p-3 text-sm ${sameName ? "border-danger/40 bg-danger-soft" : "bg-warning-soft"}`}>
            <div className={`mb-2 font-medium ${sameName ? "text-danger" : "text-warning"}`}>
              {sameName ? "This vendor is already in your list" : "Already in your list. Is it one of these?"}
            </div>
            <div className="space-y-1.5">
              {similar.map((v) => (
                <button
                  key={v._id}
                  type="button"
                  onClick={() => router.push(`/purchase/vendors/${v._id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {v.name}
                      {!v.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{v.items || v.phone || "No details"}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary">Open</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="What they supply" hint="e.g. rice, oil, packaged snacks">
          <textarea className={textarea} rows={2} maxLength={300} value={items} onChange={(e) => setItems(e.target.value)} onBlur={() => setItems((v) => properCase(v))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" hint="Optional">
            <Input value={contactPerson} maxLength={80} onChange={(e) => setContactPerson(e.target.value)} onBlur={() => setContactPerson((v) => properCase(v))} />
          </Field>
          <Field label="Phone">
            <Input value={phone} maxLength={30} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="GST number">
          <Input value={gstin} maxLength={20} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Address">
          <Input value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} onBlur={() => setAddress((v) => properCase(v))} />
        </Field>
        <Field label="Amount already owed" hint="What we already owed this vendor before using this system">
          <MoneyField value={opening} onChange={setOpening} />
        </Field>
        <Field label="Notes">
          <textarea className={textarea} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button size="lg" className="w-full" onClick={save} disabled={busy || !name.trim() || !!sameName}>
          {busy ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
        </Button>
      </div>
    </Modal>
  )
}

/* ================= BILL ================= */

export function BillForm({
  vendors,
  fixedVendorId,
  bill,
  onClose,
  onDone,
}: {
  vendors: VendorRow[]
  fixedVendorId?: string
  bill?: BillWithStatus
  onClose: () => void
  onDone: () => void
}) {
  const today = todayIST()
  const [vendorId, setVendorId] = useState(fixedVendorId ?? bill?.vendorId ?? "")
  const [billNumber, setBillNumber] = useState(bill?.billNumber ?? "")
  const [billDate, setBillDate] = useState(bill?.billDate ?? today)
  const [amount, setAmount] = useState(bill ? String(bill.amount) : "")
  const [items, setItems] = useState(bill?.items ?? "")
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? "")
  const [notes, setNotes] = useState(bill?.notes ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setError("")
    setBusy(true)
    const input = { vendorId, billNumber, billDate, amount, items, dueDate, notes }
    const res = bill ? await editBill(bill._id, input) : await addBill(input)
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  const vendorName = vendors.find((v) => v._id === vendorId)?.name

  return (
    <Modal title={bill ? "Edit bill" : "Add bill"} subtitle={vendorName} onClose={onClose}>
      <div className="space-y-4">
        {!fixedVendorId && !bill && (
          <Field label="Vendor" required>
            <select className={selectClass} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select vendor</option>
              {vendors
                .filter((v) => v.active)
                .map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill number" required>
            <Input value={billNumber} maxLength={40} onChange={(e) => setBillNumber(e.target.value)} autoFocus />
          </Field>
          <Field label="Bill date" required>
            <Input type="date" value={billDate} max={today} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Bill amount" required>
          <MoneyField value={amount} onChange={setAmount} />
        </Field>
        <Field label="Items on the bill">
          <textarea className={textarea} rows={2} maxLength={300} value={items} onChange={(e) => setItems(e.target.value)} />
        </Field>
        <Field label="Payment due date" hint="Optional: when this bill is expected to be paid">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button size="lg" className="w-full" onClick={save} disabled={busy || !vendorId || !billNumber.trim() || !(Number(amount) > 0)}>
          {busy ? "Saving…" : bill ? "Save changes" : "Add bill"}
        </Button>
      </div>
    </Modal>
  )
}

/* ================= PAYMENT ================= */

export function PaymentForm({
  vendors,
  defaultVendorId,
  defaultBillId,
  asAdmin = false,
  onClose,
  onDone,
}: {
  vendors: VendorRow[]
  defaultVendorId?: string
  defaultBillId?: string
  /** the admin paying from their own money: no in-charge to choose */
  asAdmin?: boolean
  onClose: () => void
  onDone: () => void
}) {
  const today = todayIST()
  const [vendorId, setVendorId] = useState(defaultVendorId ?? "")
  const [detail, setDetail] = useState<VendorDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [billId, setBillId] = useState(defaultBillId ?? "")
  // "__new": the vendor has just handed over a bill that is not recorded yet
  const [nbNumber, setNbNumber] = useState("")
  const [nbDate, setNbDate] = useState(today)
  const [nbAmount, setNbAmount] = useState("")
  const [nbItems, setNbItems] = useState("")
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState<PayMode>("cash")
  const [chequeNo, setChequeNo] = useState("")
  const [bank, setBank] = useState("")
  const [chequeDate, setChequeDate] = useState(today)
  const [voucherNo, setVoucherNo] = useState("")
  const [promised, setPromised] = useState("")
  const [note, setNote] = useState("")
  const [paidBy, setPaidBy] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  // the vendor's open bills
  useEffect(() => {
    if (!vendorId) {
      setDetail(null)
      return
    }
    let stale = false
    setLoading(true)
    loadVendorDetail(vendorId).then((d) => {
      if (stale) return
      setDetail(d)
      setLoading(false)
    })
    return () => {
      stale = true
    }
  }, [vendorId])

  const openBills = useMemo(() => (detail?.bills ?? []).filter((b) => b.outstanding > 0.004), [detail])
  const bill = openBills.find((b) => b._id === billId)

  // the most that can be paid right now
  const isNew = billId === NEW_BILL
  const nbAmt = Number(nbAmount) || 0
  const limit = isNew ? nbAmt : bill ? bill.outstanding : detail ? Math.max(detail.balance.billsOutstanding, 0) : 0
  const amt = Number(amount) || 0
  const over = amt > limit + 0.004

  const pickBill = (id: string) => {
    setBillId(id)
    if (id === NEW_BILL) return setAmount(nbAmount)
    const b = openBills.find((x) => x._id === id)
    if (b) setAmount(String(b.outstanding))
  }

  // when the form opens for a bill, pre-fill its balance
  useEffect(() => {
    if (defaultBillId && openBills.length > 0 && !amount) {
      const b = openBills.find((x) => x._id === defaultBillId)
      if (b) setAmount(String(b.outstanding))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBills])

  const ready =
    !!vendorId &&
    (!isNew || (!!nbNumber.trim() && nbAmt > 0)) &&
    amt > 0 &&
    !over &&
    (asAdmin || !!paidBy) &&
    (mode !== "cheque" || (chequeNo.trim() && bank.trim() && chequeDate)) &&
    (mode !== "voucher" || voucherNo.trim())

  const save = async () => {
    setError("")
    setBusy(true)
    const res = await makePayment({
      vendorId,
      billId: billId && !isNew ? billId : undefined,
      newBill: isNew ? { billNumber: nbNumber, billDate: nbDate, amount: nbAmount, items: nbItems } : undefined,
      amount,
      mode,
      paidBy,
      note,
      cheque: mode === "cheque" ? { number: chequeNo, bank, chequeDate } : undefined,
      voucher: mode === "voucher" ? { number: voucherNo, promisedDate: promised } : undefined,
    })
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  return (
    <Modal
      title="Pay a vendor"
      subtitle={asAdmin ? "Paid by the admin. This does not use the purchase counter's cash." : "Record a payment against a bill"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Vendor" required>
          <select
            className={selectClass}
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value)
              setBillId("")
              setAmount("")
            }}
          >
            <option value="">Select vendor</option>
            {vendors
              .filter((v) => v.active)
              .map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                  {v.balance.totalToPay > 0 ? `  ·  owed ₹${inr(v.balance.totalToPay)}` : ""}
                </option>
              ))}
          </select>
        </Field>

        {vendorId && (
          <Field label="Pay against" required>
            <select className={selectClass} value={billId} onChange={(e) => pickBill(e.target.value)} disabled={loading}>
              <option value="">{loading ? "Loading…" : "On account (no particular bill)"}</option>
              <option value={NEW_BILL}>＋ New bill (just received)</option>
              {openBills.map((b) => (
                <option key={b._id} value={b._id}>
                  Bill {b.billNumber} · {b.billDate} · ₹{inr(b.outstanding)} left
                </option>
              ))}
            </select>
            {!loading && openBills.length === 0 && !isNew && (
              <p className="mt-1 text-xs text-muted-foreground">No unpaid bills for this vendor.</p>
            )}
          </Field>
        )}

        {vendorId && isNew && (
          <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bill number" required>
                <Input value={nbNumber} maxLength={40} onChange={(e) => setNbNumber(e.target.value)} />
              </Field>
              <Field label="Bill date" required>
                <Input type="date" value={nbDate} max={today} onChange={(e) => setNbDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Bill amount" required hint="The full amount on the bill">
              <MoneyField
                value={nbAmount}
                onChange={(v) => {
                  // paying the whole bill is the usual case, so the amount follows until it is changed
                  if (!amount || amount === nbAmount) setAmount(v)
                  setNbAmount(v)
                }}
              />
            </Field>
            <Field label="Items">
              <Input value={nbItems} maxLength={300} placeholder="Optional" onChange={(e) => setNbItems(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label={isNew ? "Paying now" : "Amount"} required hint={vendorId && !loading ? `Up to ₹${inr(limit)}` : undefined}>
          <MoneyField value={amount} onChange={setAmount} />
          {over && <p className="mt-1 text-xs text-danger">That is more than is owed (₹{inr(limit)}).</p>}
        </Field>

        <Field label="How is it being paid?" required>
          <ModeSwitch value={mode} onChange={setMode} />
        </Field>

        {mode === "cheque" && (
          <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cheque number" required>
                <Input value={chequeNo} maxLength={30} onChange={(e) => setChequeNo(e.target.value)} />
              </Field>
              <BankSelect value={bank} onChange={setBank} />
            </div>
            <Field label="Date on the cheque" required hint="A future date is fine for a post-dated cheque">
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </Field>
          </div>
        )}

        {mode === "voucher" && (
          <div className="space-y-3 rounded-xl bg-warning-soft p-3">
            <p className="text-xs text-warning">
              The bill counts as paid, but we still owe this vendor the voucher amount until it is settled with cash or a cheque.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Voucher number" required>
                <Input value={voucherNo} maxLength={30} onChange={(e) => setVoucherNo(e.target.value)} />
              </Field>
              <Field label="Promise to pay on">
                <Input type="date" value={promised} min={today} onChange={(e) => setPromised(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <Field label="Note">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {!asAdmin && <InchargeSelect value={paidBy} onChange={setPaidBy} />}

        {isNew && nbAmt > 0 && amt > 0 && !over && (
          <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
            New bill {nbNumber || "—"} of ₹{inr(nbAmt)} will be added. Left to pay after this: <strong>₹{inr(Math.max(nbAmt - amt, 0))}</strong>
            {mode === "voucher" && <span className="text-muted-foreground"> (plus ₹{inr(amt)} owed as a voucher)</span>}
          </div>
        )}

        {bill && amt > 0 && !over && (
          <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
            Left on bill {bill.billNumber} after this: <strong>₹{inr(Math.max(bill.outstanding - amt, 0))}</strong>
            {mode === "voucher" && <span className="text-muted-foreground"> (plus ₹{inr(amt)} owed as a voucher)</span>}
          </div>
        )}

        <FormError message={error} />
        <Button size="lg" className="w-full" onClick={save} disabled={busy || !ready}>
          {busy ? "Saving…" : `Record ${mode === "cash" ? "cash" : mode} payment`}
        </Button>
      </div>
    </Modal>
  )
}

/* ================= RETURN GOODS ================= */

/** Goods sent back to the vendor (expired, damaged, wrong items): the value comes off what we owe. */
export function ReturnForm({
  vendor,
  bills,
  defaultBillId,
  asAdmin = false,
  onClose,
  onDone,
}: {
  vendor: Vendor
  bills: BillWithStatus[]
  defaultBillId?: string
  asAdmin?: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [billId, setBillId] = useState(defaultBillId ?? "")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState<string>(RETURN_REASONS[0])
  const [items, setItems] = useState("")
  const [creditNote, setCreditNote] = useState("")
  const [note, setNote] = useState("")
  const [by, setBy] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  // a bill can have goods returned up to what it came to, less what was already returned
  const returnable = (b: BillWithStatus) => Math.round((b.amount - b.returned) * 100) / 100
  const choices = bills.filter((b) => returnable(b) > 0.004)
  const bill = choices.find((b) => b._id === billId)
  const amt = Number(amount) || 0
  const over = !!bill && amt > returnable(bill) + 0.004
  const ready = amt > 0 && !over && !!reason && (asAdmin || !!by)

  const save = async () => {
    setError("")
    setBusy(true)
    const res = await makeReturn({ vendorId: vendor._id, billId: billId || undefined, amount, reason, items, creditNote, note, by })
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  return (
    <Modal title="Return goods" subtitle={`Goods sent back to ${vendor.name}. The value is taken off what we owe.`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Return against" hint="Pick the bill the goods came with">
          <select
            className={selectClass}
            value={billId}
            onChange={(e) => {
              setBillId(e.target.value)
              setAmount("")
            }}
          >
            <option value="">On account (no particular bill)</option>
            {choices.map((b) => (
              <option key={b._id} value={b._id}>
                Bill {b.billNumber} · {b.billDate} · ₹{inr(b.amount)}
                {b.returned > 0 ? ` (₹${inr(b.returned)} already returned)` : ""}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Why are they returned?" required>
            <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Value of goods returned" required hint={bill ? `Up to ₹${inr(returnable(bill))}` : undefined}>
            <MoneyField value={amount} onChange={setAmount} />
            {over && bill && <p className="mt-1 text-xs text-danger">That is more than is left to return (₹{inr(returnable(bill))}).</p>}
          </Field>
        </div>

        <Field label="What was returned" hint="e.g. Curd 12 packs, expired on 12 Oct">
          <Input value={items} maxLength={200} onChange={(e) => setItems(e.target.value)} />
        </Field>
        <Field label="Vendor's credit note number" hint="If they gave one">
          <Input value={creditNote} maxLength={40} onChange={(e) => setCreditNote(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {!asAdmin && <InchargeSelect value={by} onChange={setBy} label="Recorded by" />}

        {amt > 0 && !over && (
          <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
            ₹{inr(amt)} will be taken off what we owe {vendor.name}
            {bill && <> on bill {bill.billNumber}</>}. No cash moves.
          </div>
        )}

        <FormError message={error} />
        <Button size="lg" className="w-full" onClick={save} disabled={busy || !ready}>
          {busy ? "Saving…" : "Record return"}
        </Button>
      </div>
    </Modal>
  )
}

/* ================= SETTLE A VOUCHER ================= */

export function SettleVoucherForm({
  voucher,
  vendorName,
  asAdmin = false,
  onClose,
  onDone,
}: {
  voucher: Voucher
  vendorName: string
  asAdmin?: boolean
  onClose: () => void
  onDone: () => void
}) {
  const today = todayIST()
  const [mode, setMode] = useState<"cash" | "cheque">("cash")
  const [chequeNo, setChequeNo] = useState("")
  const [bank, setBank] = useState("")
  const [chequeDate, setChequeDate] = useState(today)
  const [paidBy, setPaidBy] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const ready = (asAdmin || !!paidBy) && (mode === "cash" || (chequeNo.trim() && bank.trim() && chequeDate))

  const save = async () => {
    setError("")
    setBusy(true)
    const res = await settleVoucher({
      voucherId: voucher._id,
      mode,
      paidBy,
      cheque: mode === "cheque" ? { number: chequeNo, bank, chequeDate } : undefined,
    })
    setBusy(false)
    if (res.error) return setError(res.error)
    onDone()
  }

  return (
    <Modal title="Settle voucher" subtitle={`${vendorName} · voucher ${voucher.number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
          <span className="text-sm text-muted-foreground">Amount to pay</span>
          <span className="text-xl font-semibold">₹{inr(voucher.amount)}</span>
        </div>

        <Field label="Pay with" required>
          <ModeSwitch value={mode} onChange={(m) => setMode(m as "cash" | "cheque")} modes={["cash", "cheque"]} />
        </Field>

        {mode === "cheque" && (
          <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cheque number" required>
                <Input value={chequeNo} maxLength={30} onChange={(e) => setChequeNo(e.target.value)} />
              </Field>
              <BankSelect value={bank} onChange={setBank} />
            </div>
            <Field label="Date on the cheque" required>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </Field>
          </div>
        )}

        {!asAdmin && <InchargeSelect value={paidBy} onChange={setPaidBy} />}
        <FormError message={error} />
        <Button size="lg" className="w-full" onClick={save} disabled={busy || !ready}>
          {busy ? "Saving…" : "Settle voucher"}
        </Button>
      </div>
    </Modal>
  )
}
