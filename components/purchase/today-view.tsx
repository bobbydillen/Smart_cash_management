"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import SectionHeader from "@/components/section-header"
import StatusChip from "@/components/status-chip"
import SaveIndicator from "@/components/save-indicator"
import { DenomRow, GroupLabel } from "@/components/denom-row"
import { Notice } from "@/components/notice"
import TransferButton from "@/components/transfer-button"
import IncomingTransfersBanner from "@/components/incoming-transfers-banner"
import { useAutosave } from "@/hooks/use-autosave"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  FileText,
  HandCoins,
  Plus,
  ReceiptText,
  Scale,
  Unlock,
  UserCheck,
  Wallet,
  X,
} from "lucide-react"
import { BillForm, PaymentForm } from "./forms"
import { CashReceivedForm, MoneyMoveForm } from "./cash-forms"
import DayTimeline from "./day-timeline"
import { InchargeSelect, ModeChip, SourceChip } from "./common"
import {
  cancelCashPayment,
  removeCashMove,
  acknowledgePurchaseHandover,
  confirmPurchaseDay,
  saveClosingCount,
  submitPurchaseDay,
  unlockPurchaseDay,
} from "@/app/actions/purchase"
import { COIN_KEYS, DENOMS, NOTE_KEYS, allocateLargestFirst, deriveKeep, emptyDenoms, subtractDenoms } from "@/lib/next-day"
import { calculateClosingCash } from "@/lib/types"
import { inr, shortDate } from "@/lib/report"
import type { DayView, VendorRow } from "@/lib/purchase-service"
import type { CashMove } from "@/lib/purchase"

export default function TodayView({
  view,
  vendors,
  role,
  date,
  today,
}: {
  view: DayView | null
  vendors: VendorRow[]
  role: "purchase" | "admin" | "supervisor"
  date: string
  today: string
}) {
  const router = useRouter()
  const refresh = async () => router.refresh()

  const isPurchase = role === "purchase"
  const isAdmin = role === "admin"
  const status = view?.day.status ?? "open"
  const canEdit = isPurchase && status === "open" && date === today

  const [modal, setModal] = useState<"payment" | "bill" | "received" | "in" | "out" | null>(null)
  const [closing, setClosing] = useState({ ...emptyDenoms(), ...(view?.day.closingDenominations ?? {}) })
  // cash kept in the drawer for tomorrow; the rest is handed over to the admin
  const [keep, setKeep] = useState(
    deriveKeep({ ...emptyDenoms(), ...(view?.day.closingDenominations ?? {}) }, view?.day.nextDayOpeningDenominations)
  )
  // the counter must make a choice (even "keep nothing") before submitting
  const [keepSet, setKeepSet] = useState(!!view?.day.nextDayOpeningDenominations)
  const [keepAmount, setKeepAmount] = useState("")
  const [closedBy, setClosedBy] = useState(view?.day.closedBy ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const closingSave = useAutosave({
    value: { closing, keep: keepSet ? keep : null },
    enabled: canEdit,
    save: async (snapshot) => {
      const res = await saveClosingCount(snapshot.closing, snapshot.keep ?? undefined)
      if (res.error) return { error: res.error }
    },
  })

  const run = async (work: () => Promise<{ error?: string }>) => {
    setError("")
    setBusy(true)
    const res = await work()
    setBusy(false)
    if (res.error) return setError(res.error)
    router.refresh()
  }

  if (!view) {
    return (
      <div className="space-y-5">
        <DateBar date={date} today={today} />
        <Card className="py-14 text-center text-sm text-muted-foreground">No purchase activity on this date.</Card>
      </div>
    )
  }

  const s = view.summary
  const when = date === today ? "today" : "that day"
  const counted = calculateClosingCash(closing)
  const sumKind = (list: { kind?: string; amount: number }[], kind: string) =>
    list.filter((m) => m.kind === kind).reduce((t, m) => t + m.amount, 0)
  const otherIn = sumKind(view.day.cashIn, "other-in")
  const otherOut = sumKind(view.day.cashOut, "other-out")

  // what is kept can never be more than what was counted
  const keepNow = deriveKeep(closing, keep)
  const keepTotal = calculateClosingCash(keepNow)
  const handoverNow = subtractDenoms(closing, keepNow)
  const handoverTotal = calculateClosingCash(handoverNow)

  const chooseKeep = (next: typeof keep) => {
    setKeep(next)
    setKeepSet(true)
  }
  const shortage = status === "open" ? s.expected - counted : (view.day.submittedShortage ?? s.shortage)
  const noteRows = DENOMS.filter((d) => NOTE_KEYS.includes(d[1] as never))
  const coinRows = DENOMS.filter((d) => COIN_KEYS.includes(d[1] as never))

  const submit = async () => {
    if (!(await closingSave.flush())) return setError("The count could not be saved yet. Try again.")
    await run(() => submitPurchaseDay(closedBy))
  }

  return (
    <div className="space-y-5">
      <DateBar date={date} today={today} status={status} />

      {(isPurchase || isAdmin) && date === today && (isAdmin || status === "open") && (
        <div className="flex justify-end">
          <TransferButton refreshEntry={refresh} onClosed={() => router.refresh()} />
        </div>
      )}

      {isPurchase && status === "open" && date === today && (
        <IncomingTransfersBanner canAccept refreshEntry={refresh} />
      )}

      {/* ================= CASH ================= */}
      <Card className="p-5">
        <SectionHeader
          icon={<Wallet className="size-4" />}
          title="Cash in hand"
          subtitle={date === today ? "What should be in the drawer right now" : "What should have been in the drawer at the end of the day"}
        />
        <div className="mt-4 text-4xl font-semibold tracking-tight">₹{inr(s.expected)}</div>

        <div className="mt-4 divide-y rounded-xl border text-sm">
          <Line label="Opening cash" value={s.opening} />
          <Line label="Cash received" value={s.received - otherIn} sign="+" tone="success" />
          {otherIn > 0 && <Line label="Other money in" value={otherIn} sign="+" tone="success" />}
          <Line label="Paid to vendors in cash" value={s.paidCash} sign="−" tone="danger" />
          <Line label="Sent back to counters / admin" value={s.sentOut - otherOut} sign="−" tone="danger" />
          {otherOut > 0 && <Line label="Other money out" value={otherOut} sign="−" tone="danger" />}
        </div>

        {view.day.cashIn.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money in {when}</div>
            <div className="space-y-1.5">
              {view.day.cashIn.map((m) => (
                <MoveRow key={m.id} move={m} out={false} canEdit={canEdit} onRemove={(id) => run(() => removeCashMove(id))} />
              ))}
            </div>
          </div>
        )}
        {view.day.cashOut.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money out {when}</div>
            <div className="space-y-1.5">
              {view.day.cashOut.map((m) => (
                <MoveRow key={m.id} move={m} out canEdit={canEdit} onRemove={(id) => run(() => removeCashMove(id))} />
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ================= TODAY'S TOTALS ================= */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini
          label={`Paid ${when} (everyone)`}
          value={`₹${inr(s.paidTotal)}`}
          sub={`${s.vendorsPaid} vendor${s.vendorsPaid === 1 ? "" : "s"} paid`}
        />
        <Mini label="Cash from this drawer" value={`₹${inr(s.paidCash)}`} />
        <Mini label="Cheques + vouchers" value={`₹${inr(s.paidCheque + s.paidVoucher)}`} sub={`Cheque ₹${inr(s.paidCheque)} · Voucher ₹${inr(s.paidVoucher)}`} />
        <Mini label="Paid by admin / counters" value={`₹${inr(s.paidByAdmin + s.paidByCounters)}`} sub={`Admin ₹${inr(s.paidByAdmin)} · Counters ₹${inr(s.paidByCounters)}`} />
      </div>

      {/* ================= ACTIONS ================= */}
      {canEdit && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => setModal("payment")}>
              <Banknote /> Pay a vendor
            </Button>
            <Button size="lg" variant="outline" onClick={() => setModal("bill")}>
              <Plus /> Add a bill
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setModal("received")}>
              <HandCoins /> Cash received
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setModal("in")}>
              <ArrowDownToLine /> Money in
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setModal("out")}>
              <ArrowUpFromLine /> Money out
            </Button>
          </div>
        </div>
      )}

      {/* ================= PAYMENTS TODAY ================= */}
      <Card className="p-5">
        <SectionHeader
          icon={<ReceiptText className="size-4" />}
          title="Payments"
          subtitle={s.paymentCount === 0 ? "Nothing paid yet" : `${s.paymentCount} payment${s.paymentCount === 1 ? "" : "s"} to ${s.vendorsPaid} vendor${s.vendorsPaid === 1 ? "" : "s"}`}
        />
        {view.payments.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No payments recorded.</div>
        ) : (
          <div className="mt-3 divide-y">
            {view.payments.map((p) => (
              <div key={p._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.vendorName}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.billNumber ? `Bill ${p.billNumber}` : p.settlesVoucherId ? "Voucher settlement" : "On account"}
                    {p.reference && ` · ${p.reference}`} · {p.paidBy}
                  </div>
                </div>
                <SourceChip source={p.source} name={p.sourceName} />
                <ModeChip mode={p.mode} />
                <div className="w-28 text-right text-sm font-semibold">₹{inr(p.amount)}</div>
                {canEdit && p.mode === "cash" && (!p.source || p.source === "purchase") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
                    aria-label="Cancel this payment"
                    title="Cancel this payment"
                    onClick={() => {
                      if (confirm(`Cancel the ₹${inr(p.amount)} cash payment to ${p.vendorName}?`)) run(() => cancelCashPayment(p._id))
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <DayTimeline view={view} />

      {/* ================= CHEQUES + VOUCHERS TODAY ================= */}
      {(view.cheques.length > 0 || view.vouchers.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {view.cheques.length > 0 && (
            <Card className="p-5">
              <SectionHeader icon={<FileText className="size-4" />} title={`Cheques given ${when}`} />
              <div className="mt-3 space-y-2">
                {view.cheques.map((c) => (
                  <div key={c._id} className="rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{c.vendorName}</span>
                      <span>₹{inr(c.amount)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.bank} · {c.number} · dated {shortDate(c.chequeDate)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {view.vouchers.length > 0 && (
            <Card className="p-5">
              <SectionHeader icon={<FileText className="size-4" />} title={`Vouchers given ${when}`} />
              <div className="mt-3 space-y-2">
                {view.vouchers.map((v) => (
                  <div key={v._id} className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{v.vendorName}</span>
                      <span>₹{inr(v.amount)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Voucher {v.number}
                      {v.promisedDate && ` · to be paid by ${shortDate(v.promisedDate)}`}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================= CLOSING COUNT ================= */}
      <Card className="p-5">
        <SectionHeader
          icon={<HandCoins className="size-4" />}
          title="Count the cash"
          subtitle="Count the drawer at the end of the day"
        />
        {canEdit && (
          <div className="mt-2">
            <SaveIndicator status={closingSave.status} error={closingSave.errorMessage} onRetry={closingSave.retry} />
          </div>
        )}

        <GroupLabel>Notes</GroupLabel>
        <div className="space-y-1.5">
          {noteRows.map(([label, key, value]) => (
            <DenomRow
              key={key}
              label={label}
              count={closing[key]}
              amount={closing[key] * value}
              disabled={!canEdit}
              onSet={(n) => setClosing((c) => ({ ...c, [key]: n }))}
            />
          ))}
        </div>
        <GroupLabel>Coins</GroupLabel>
        <div className="space-y-1.5">
          {coinRows.map(([label, key, value]) => (
            <DenomRow
              key={key}
              label={label}
              count={closing[key]}
              amount={closing[key] * value}
              disabled={!canEdit}
              onSet={(n) => setClosing((c) => ({ ...c, [key]: n }))}
            />
          ))}
        </div>

        <div className="mt-4 space-y-2 rounded-xl border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Should be in the drawer</span>
            <span className="font-medium">₹{inr(status === "open" ? s.expected : (view.day.submittedExpectedCash ?? s.expected))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Counted</span>
            <span className="font-medium">₹{inr(status === "open" ? counted : (view.day.submittedActualCash ?? counted))}</span>
          </div>
        </div>
        <div
          className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 ${
            Math.abs(shortage) < 0.005 ? "bg-success-soft text-success" : shortage > 0 ? "bg-danger-soft text-danger" : "bg-info-soft text-info"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="size-4" />
            {Math.abs(shortage) < 0.005 ? "Balanced" : shortage > 0 ? "Shortage" : "Excess"}
          </span>
          <span className="text-xl font-semibold">₹{inr(Math.abs(shortage))}</span>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        {/* ================= CASH FOR TOMORROW / HANDOVER ================= */}
        {canEdit && (
          <div className="mt-6 border-t pt-5">
            <SectionHeader
              icon={<HandCoins className="size-4" />}
              title="Cash for tomorrow"
              subtitle="Choose how much stays in the drawer. The rest is handed over to the admin."
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant={keepSet && keepTotal === 0 ? "default" : "outline"} onClick={() => chooseKeep(emptyDenoms())}>
                Keep nothing
              </Button>
              <Button variant={keepSet && keepTotal === counted && counted > 0 ? "default" : "outline"} onClick={() => chooseKeep({ ...closing })}>
                Keep all
              </Button>
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Or type an amount to keep"
                  value={keepAmount}
                  onChange={(e) => setKeepAmount(e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  className="pl-7"
                />
              </div>
              <Button
                variant="outline"
                disabled={!(Number(keepAmount) >= 0) || keepAmount === ""}
                onClick={() => chooseKeep(allocateLargestFirst(closing, Number(keepAmount)))}
              >
                Fill
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Uses the largest notes first. You can adjust each note below.</p>

            <GroupLabel>Keep for tomorrow</GroupLabel>
            <div className="space-y-1.5">
              {DENOMS.filter(([, k]) => closing[k] > 0).map(([label, key, value]) => (
                <DenomRow
                  key={key}
                  label={label}
                  sub={`of ${closing[key]}${COIN_KEYS.includes(key as never) ? " coins" : ""}`}
                  count={keepNow[key]}
                  amount={keepNow[key] * value}
                  max={closing[key]}
                  onSet={(n) => chooseKeep({ ...keepNow, [key]: n })}
                />
              ))}
              {counted === 0 && (
                <div className="rounded-xl border border-dashed py-5 text-center text-sm text-muted-foreground">
                  Count the cash above first.
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Counted</span>
                <span className="font-medium">₹{inr(counted)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Keep for tomorrow</span>
                <span className="font-medium">₹{inr(keepTotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Hand over to admin</span>
                <span>₹{inr(handoverTotal)}</span>
              </div>
            </div>

            {handoverTotal > 0 && (
              <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hand over these</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {DENOMS.filter(([, k]) => handoverNow[k] > 0).map(([label, key]) => (
                    <span key={key}>
                      {label}
                      {COIN_KEYS.includes(key as never) ? " coin" : ""} × {handoverNow[key]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!keepSet && <Notice tone="warning">Choose what to keep for tomorrow before submitting (it can be nothing).</Notice>}
          </div>
        )}

        {/* recorded outcome once the day is closed */}
        {status !== "open" && view.day.nextDayOpeningDenominations && (
          <div className="mt-6 border-t pt-5">
            <SectionHeader icon={<HandCoins className="size-4" />} title="Cash for tomorrow" />
            <div className="mt-3 space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kept for tomorrow</span>
                <span className="font-medium">₹{inr(s.keep)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Handed over to admin</span>
                <span>₹{inr(view.day.handoverAmount ?? s.handover)}</span>
              </div>
            </div>
            {(view.day.handoverAmount ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
                {view.day.handoverReceivedAt ? (
                  <StatusChip tone="success">
                    Received by {view.day.handoverReceivedBy} · {new Date(view.day.handoverReceivedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </StatusChip>
                ) : (
                  <>
                    <StatusChip tone="warning">Waiting for the admin to receive it</StatusChip>
                    {isAdmin && (
                      <Button size="sm" disabled={busy} onClick={() => run(() => acknowledgePurchaseHandover(date))}>
                        <CheckCheck /> Mark received
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* close the day */}
        {canEdit && (
          <div className="mt-5 space-y-3 border-t pt-5">
            <InchargeSelect value={closedBy} onChange={setClosedBy} label="Closed by" />
            <Button size="lg" className="w-full" onClick={submit} disabled={busy || !closedBy || !keepSet}>
              <UserCheck /> {busy ? "Submitting…" : "Submit the day"}
            </Button>
          </div>
        )}

        {status !== "open" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <div>
              <div className="text-xs text-muted-foreground">Closed by</div>
              <div className="font-medium">{view.day.closedBy ?? "—"}</div>
              {status === "confirmed" && view.day.confirmedBy && (
                <div className="text-xs text-muted-foreground">Confirmed by {view.day.confirmedBy}</div>
              )}
            </div>
            <div className="flex gap-2">
              {isAdmin && status === "submitted" && (
                <Button disabled={busy} onClick={() => run(() => confirmPurchaseDay(date))}>
                  <CheckCheck /> Confirm
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Unlock this day so it can be changed?")) run(() => unlockPurchaseDay(date))
                  }}
                >
                  <Unlock /> Unlock
                </Button>
              )}
              {status === "submitted" && !isAdmin && <StatusChip tone="warning">Awaiting admin confirmation</StatusChip>}
            </div>
          </div>
        )}
      </Card>

      {modal === "payment" && (
        <PaymentForm
          vendors={vendors}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === "received" && (
        <CashReceivedForm
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {(modal === "in" || modal === "out") && (
        <MoneyMoveForm
          direction={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === "bill" && (
        <BillForm
          vendors={vendors}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/* ================= SMALL PIECES ================= */

function DateBar({
  date,
  today,
  status,
}: {
  date: string
  today: string
  role?: string
  status?: string
}) {
  const router = useRouter()
  const go = (d: string) => router.push(d >= today ? "/purchase" : `/purchase?date=${d}`)
  const shift = (days: number) => {
    const t = new Date(date + "T00:00:00Z")
    t.setUTCDate(t.getUTCDate() + days)
    go(t.toISOString().slice(0, 10))
  }
  const pretty = new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{date === today ? "Today" : "Earlier day"}</h2>
          <p className="text-sm text-muted-foreground">{pretty}</p>
        </div>
        <div className="flex items-center gap-2">
          {status === "open" && <StatusChip tone="info">Day open</StatusChip>}
          {status === "submitted" && <StatusChip tone="warning">Submitted</StatusChip>}
          {status === "confirmed" && <StatusChip tone="success">Confirmed</StatusChip>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            max={today}
            className="h-10 w-auto text-sm"
            onChange={(e) => e.target.value && go(e.target.value)}
            aria-label="Choose a day"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => shift(1)} disabled={date >= today} aria-label="Next day">
          <ChevronRight />
        </Button>
        {date !== today && (
          <Button variant="ghost" size="sm" onClick={() => go(today)}>
            Back to today
          </Button>
        )}
      </div>

      {date !== today && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
          You are looking at an earlier day. It can only be viewed here.
        </p>
      )}
    </div>
  )
}

function MoveRow({
  move: m,
  out,
  canEdit,
  onRemove,
}: {
  move: CashMove
  out: boolean
  canEdit: boolean
  onRemove: (id: string) => void
}) {
  const time = new Date(m.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  const label = m.kind === "received" ? `Cash from ${m.party}` : m.kind ? m.party : out ? `Sent to ${m.party}` : m.party
  const removable = canEdit && !!m.kind
  const notes = m.denominations
    ? DENOMS.filter((d) => (m.denominations![d[1]] ?? 0) > 0)
        .map((d) => `${m.denominations![d[1]]}×${d[0]}`)
        .join("  ")
    : ""

  return (
    <div className={`rounded-lg px-3 py-2 text-sm ${out ? "bg-danger-soft" : "bg-success-soft"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">
            {" "}
            · {time}
            {m.by && ` · ${m.by}`}
            {m.note && ` · ${m.note}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`font-semibold ${out ? "text-danger" : "text-success"}`}>
            {out ? "−" : "+"}₹{inr(m.amount)}
          </span>
          {removable && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Remove this entry"
              title="Remove this entry"
              onClick={() => {
                if (confirm(`Remove this ₹${inr(m.amount)} entry?`)) onRemove(m.id)
              }}
            >
              <X />
            </Button>
          )}
        </span>
      </div>
      {notes && <div className="mt-1 text-xs text-muted-foreground">{notes}</div>}
    </div>
  )
}

function Line({ label, value, sign, tone }: { label: string; value: number; sign?: string; tone?: "success" | "danger" }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : ""}`}>
        {sign}₹{inr(value)}
      </span>
    </div>
  )
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}
