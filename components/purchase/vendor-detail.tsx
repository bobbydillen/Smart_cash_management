"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SectionHeader from "@/components/section-header"
import StatusChip from "@/components/status-chip"
import { Notice } from "@/components/notice"
import {
  Banknote,
  Ban,
  CheckCircle2,
  FilePlus2,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Trash2,
  Truck,
  Undo2,
  UserPlus,
  X,
} from "lucide-react"
import { BillForm, PaymentForm, SettleVoucherForm, VendorForm } from "./forms"
import { ModeChip, SourceChip, relativeDay } from "./common"
import { cancelCashPayment, cancelVoucher, changeChequeStatus, removeBill, toggleVendor } from "@/app/actions/purchase"
import { inr, shortDate, todayIST } from "@/lib/report"
import { buildTimeline, payerLabel, type BillWithStatus, type ChequeStatus, type TimelineEvent, type Voucher } from "@/lib/purchase"
import type { VendorDetail, VendorRow } from "@/lib/purchase-service"

const BILL_TONE = { unpaid: "danger", part: "warning", paid: "success" } as const
const BILL_LABEL = { unpaid: "Unpaid", part: "Part paid", paid: "Paid" } as const
const CHEQUE_TONE: Record<ChequeStatus, "info" | "success" | "danger" | "neutral"> = {
  issued: "info",
  cleared: "success",
  bounced: "danger",
  cancelled: "neutral",
}

export default function VendorDetailView({
  detail,
  vendors,
  role,
}: {
  detail: VendorDetail
  vendors: VendorRow[]
  role: "purchase" | "admin" | "supervisor"
}) {
  const router = useRouter()
  const today = todayIST()
  const canEdit = role === "purchase"
  // the admin can also pay vendors, clear cheques and settle vouchers (from their own money)
  const canPay = role === "purchase" || role === "admin"
  const asAdmin = role === "admin"
  const { vendor, balance, bills, payments, cheques, vouchers } = detail

  const [modal, setModal] = useState<
    | { kind: "edit" }
    | { kind: "bill"; bill?: BillWithStatus }
    | { kind: "pay"; billId?: string }
    | { kind: "settle"; voucher: Voucher }
    | null
  >(null)
  const [error, setError] = useState("")
  const [payLimit, setPayLimit] = useState(FIRST)
  const [billLimit, setBillLimit] = useState(FIRST)
  const [chequeLimit, setChequeLimit] = useState(FIRST)

  const done = () => {
    setModal(null)
    router.refresh()
  }

  const act = async (work: () => Promise<{ error?: string }>) => {
    setError("")
    const res = await work()
    if (res.error) return setError(res.error)
    router.refresh()
  }

  const pendingVouchers = vouchers.filter((v) => v.status === "pending")

  return (
    <div className="space-y-5">
      {/* ================= HEADER ================= */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{vendor.name}</h2>
              {!vendor.active && <StatusChip tone="neutral" dot={false}>Inactive</StatusChip>}
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {vendor.items && (
                <div className="flex items-start gap-2">
                  <Truck className="mt-0.5 size-4 shrink-0" /> <span>Supplies: {vendor.items}</span>
                </div>
              )}
              {(vendor.contactPerson || vendor.phone) && (
                <div className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0" />
                  {[vendor.contactPerson, vendor.phone].filter(Boolean).join(" · ")}
                </div>
              )}
              {vendor.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" /> {vendor.address}
                </div>
              )}
              {vendor.gstin && <div>GST: {vendor.gstin}</div>}
              {vendor.notes && <div className="italic">{vendor.notes}</div>}
            </div>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setModal({ kind: "edit" })}>
              <Pencil /> Edit
            </Button>
          )}
        </div>

        {canPay && vendor.active && (
          <div className={`mt-4 grid gap-3 ${canEdit ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button size="lg" onClick={() => setModal({ kind: "pay" })} disabled={balance.billsOutstanding <= 0.004}>
              <Banknote /> {asAdmin ? "Pay vendor (admin)" : "Pay vendor"}
            </Button>
            {canEdit && (
              <Button size="lg" variant="outline" onClick={() => setModal({ kind: "bill" })}>
                <Plus /> Add bill
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* ================= BALANCE ================= */}
      <Card className={`p-5 ${balance.totalToPay > 0.004 ? "border-warning/30 bg-warning-soft" : ""}`}>
        <div className="text-sm text-muted-foreground">Total still to pay</div>
        <div className="mt-1 text-4xl font-semibold tracking-tight">₹{inr(Math.max(balance.totalToPay, 0))}</div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Fact label="Unpaid on bills" value={balance.billsOutstanding} />
          <Fact label="Vouchers pending" value={balance.vouchersPending} />
          <Fact label="Total billed" value={balance.billed + balance.opening} hint={balance.opening > 0 ? `incl. ₹${inr(balance.opening)} brought forward` : undefined} />
          <Fact label="Total paid" value={balance.paid} />
        </div>
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* ================= VOUCHERS PENDING ================= */}
      {pendingVouchers.length > 0 && (
        <Card className="p-5">
          <SectionHeader icon={<FileText className="size-4" />} title="Vouchers waiting to be paid" subtitle="Settle these with cash or a cheque when the vendor comes" />
          <div className="mt-3 space-y-2">
            {pendingVouchers.map((v) => {
              const overdue = v.promisedDate && v.promisedDate < today
              return (
                <div key={v._id} className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Voucher {v.number}</div>
                    <div className="text-xs text-muted-foreground">
                      Given {shortDate(v.issuedDate)}
                      {v.promisedDate && (
                        <>
                          {" · "}
                          <span className={overdue ? "font-medium text-danger" : ""}>
                            to be paid by {shortDate(v.promisedDate)} ({relativeDay(v.promisedDate, today)})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-base font-semibold">₹{inr(v.amount)}</div>
                  {canPay && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setModal({ kind: "settle", voucher: v })}>
                        Settle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => confirm(`Cancel voucher ${v.number}? The bill goes back to unpaid.`) && act(() => cancelVoucher(v._id))}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ================= BILLS ================= */}
      <Card className="p-5">
        <SectionHeader icon={<Receipt className="size-4" />} title="Bills" subtitle={`${bills.length} bill${bills.length === 1 ? "" : "s"}`} />
        {bills.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No bills yet.</div>
        ) : (
          <div className="mt-3 divide-y">
            {bills.slice(0, billLimit).map((b) => {
              const overdue = b.dueDate && b.status !== "paid" && b.dueDate < today
              return (
                <div key={b._id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        Bill {b.billNumber}
                        <StatusChip tone={BILL_TONE[b.status]}>{BILL_LABEL[b.status]}</StatusChip>
                        {overdue && <StatusChip tone="danger" dot={false}>Overdue</StatusChip>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {shortDate(b.billDate)}
                        {b.dueDate && ` · due ${shortDate(b.dueDate)}`}
                        {b.items && ` · ${b.items}`}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold">₹{inr(b.amount)}</div>
                      {b.status !== "unpaid" && (
                        <div className="text-xs text-muted-foreground">
                          paid ₹{inr(b.paid)}
                          {b.status === "part" && <> · left ₹{inr(b.outstanding)}</>}
                        </div>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {b.outstanding > 0.004 && (
                        <Button size="sm" onClick={() => setModal({ kind: "pay", billId: b._id })}>
                          <Banknote /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setModal({ kind: "bill", bill: b })}>
                        <Pencil /> Edit
                      </Button>
                      {b.paid === 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          onClick={() => confirm(`Delete bill ${b.billNumber}?`) && act(() => removeBill(b._id))}
                        >
                          <Trash2 /> Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <ShowMore
          shown={billLimit}
          total={bills.length}
          onMore={() => setBillLimit((n) => n + STEP)}
          onLess={() => setBillLimit(FIRST)}
        />
      </Card>

      {/* ================= CHEQUES ================= */}
      {cheques.length > 0 && (
        <Card className="p-5">
          <SectionHeader icon={<FileText className="size-4" />} title="Cheques" />
          <div className="mt-3 divide-y">
            {cheques.slice(0, chequeLimit).map((c) => (
              <div key={c._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {c.bank} · {c.number}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    dated {shortDate(c.chequeDate)} ({relativeDay(c.chequeDate, today)}) · given {shortDate(c.issuedDate)}
                  </div>
                </div>
                <StatusChip tone={CHEQUE_TONE[c.status]}>{c.status[0].toUpperCase() + c.status.slice(1)}</StatusChip>
                <div className="w-28 text-right text-sm font-semibold">₹{inr(c.amount)}</div>
                {canPay && c.status === "issued" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => act(() => changeChequeStatus(c._id, "cleared"))}>
                      Cleared
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm("Mark this cheque as bounced? The amount goes back to what we owe.") && act(() => changeChequeStatus(c._id, "bounced"))}
                    >
                      Bounced
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <ShowMore
            shown={chequeLimit}
            total={cheques.length}
            onMore={() => setChequeLimit((n) => n + STEP)}
            onLess={() => setChequeLimit(FIRST)}
          />
        </Card>
      )}

      {/* ================= PAYMENT HISTORY ================= */}
      <Card className="p-5">
        <SectionHeader
          icon={<Banknote className="size-4" />}
          title="Payment history"
          subtitle={`${payments.filter((p) => !p.voided).length} payment${payments.filter((p) => !p.voided).length === 1 ? "" : "s"} · ₹${inr(balance.paid)} paid on bills`}
        />
        {payments.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No payments yet.</div>
        ) : (
          <div className="mt-3 divide-y">
            {payments.slice(0, payLimit).map((p) => {
              const cheque = p.chequeId ? cheques.find((c) => c._id === p.chequeId) : undefined
              const forBill = p.billId ? bills.find((b) => b._id === p.billId)?.billNumber : undefined
              const settled = p.settlesVoucherId ? vouchers.find((v) => v._id === p.settlesVoucherId) : undefined
              return (
                <div key={p._id} className={`py-3 ${p.voided ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {new Date(p.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {forBill ? `Bill ${forBill}` : settled ? `Settles voucher ${settled.number}` : "On account"}
                        {p.reference && !settled && <> · {p.mode === "voucher" ? "voucher" : "cheque"} {p.reference}</>}
                      </div>
                    </div>
                    <ModeChip mode={p.mode} />
                    <div className={`w-28 text-right text-sm font-semibold ${p.voided ? "line-through" : ""}`}>₹{inr(p.amount)}</div>
                    {asAdmin && !p.voided && p.mode === "cash" && p.source === "admin" && p.date === today && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
                        aria-label="Cancel this payment"
                        title="Cancel this payment"
                        onClick={() => confirm(`Cancel the ₹${inr(p.amount)} cash payment?`) && act(() => cancelCashPayment(p._id))}
                      >
                        <X />
                      </Button>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Paid by <strong className="font-medium text-foreground">{payerLabel(p)}</strong>
                    </span>
                    {cheque && (
                      <span>
                        {cheque.bank} · dated {shortDate(cheque.chequeDate)} · <span className="capitalize">{cheque.status}</span>
                      </span>
                    )}
                    {p.note && <span>“{p.note}”</span>}
                    {p.voided && <StatusChip tone="neutral" dot={false}>Cancelled</StatusChip>}
                  </div>
                  <div className="mt-1">
                    <SourceChip source={p.source} name={p.sourceName} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <ShowMore
          shown={payLimit}
          total={payments.length}
          onMore={() => setPayLimit((n) => n + STEP)}
          onLess={() => setPayLimit(FIRST)}
        />
      </Card>

      {/* ================= TIMELINE ================= */}
      <VendorTimeline
        events={buildTimeline({ vendor, bills, payments, cheques, vouchers })}
      />

      {canEdit && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => act(() => toggleVendor(vendor._id, !vendor.active))}>
            {vendor.active ? "Mark vendor inactive" : "Make vendor active again"}
          </Button>
        </div>
      )}

      {modal?.kind === "edit" && <VendorForm vendor={vendor} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === "bill" && (
        <BillForm vendors={vendors} fixedVendorId={vendor._id} bill={modal.bill} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === "pay" && (
        <PaymentForm vendors={vendors} defaultVendorId={vendor._id} defaultBillId={modal.billId} asAdmin={asAdmin} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === "settle" && (
        <SettleVoucherForm voucher={modal.voucher} vendorName={vendor.name} asAdmin={asAdmin} onClose={() => setModal(null)} onDone={done} />
      )}
    </div>
  )
}

function Fact({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">₹{inr(value)}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/* ================= SHOW MORE ================= */

const FIRST = 5
const STEP = 10

/** Shows the first few rows, with a button to reveal more (and to fold them away again). */
function ShowMore({
  shown,
  total,
  onMore,
  onLess,
}: {
  shown: number
  total: number
  onMore: () => void
  onLess: () => void
}) {
  if (total <= FIRST) return null
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t pt-4">
      {shown < total && (
        <Button variant="outline" size="sm" onClick={onMore}>
          Show more ({Math.min(STEP, total - shown)} of {total - shown} more)
        </Button>
      )}
      {shown > FIRST && (
        <Button variant="ghost" size="sm" onClick={onLess}>
          Show less
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        Showing {Math.min(shown, total)} of {total}
      </span>
    </div>
  )
}

/* ================= TIMELINE ================= */

const KIND_STYLE: Record<TimelineEvent["kind"], { icon: typeof Receipt; tone: string }> = {
  vendor: { icon: UserPlus, tone: "bg-secondary text-muted-foreground" },
  bill: { icon: FilePlus2, tone: "bg-warning-soft text-warning" },
  payment: { icon: Banknote, tone: "bg-success-soft text-success" },
  cheque: { icon: CheckCircle2, tone: "bg-info-soft text-info" },
  voucher: { icon: FileText, tone: "bg-warning-soft text-warning" },
  reversal: { icon: Undo2, tone: "bg-danger-soft text-danger" },
}

/** Everything that happened with the vendor, newest first, with what is owed after each step. */
function VendorTimeline({ events }: { events: TimelineEvent[] }) {
  const [oldestFirst, setOldestFirst] = useState(false)
  const [limit, setLimit] = useState(FIRST)
  const ordered = oldestFirst ? events : [...events].reverse()
  const shown = ordered.slice(0, limit)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={<Ban className="size-4" />}
          title="Timeline"
          subtitle="When each bill arrived and when payments were made"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOldestFirst((v) => !v)
            setLimit(FIRST)
          }}
        >
          {oldestFirst ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      <ol className="mt-5">
        {shown.map((e, i) => {
          const style = KIND_STYLE[e.kind]
          const Icon = style.icon
          const last = i === shown.length - 1
          return (
            <li key={i} className="relative flex gap-3 pb-6 last:pb-0">
              {!last && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-border" aria-hidden />}
              <div className={`z-10 grid size-9 shrink-0 place-items-center rounded-full ${style.tone}`}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <div className="text-sm font-medium">{e.title}</div>
                  {e.amount !== undefined && (
                    <div
                      className={`text-sm font-semibold ${
                        e.effect === "+" && e.kind === "bill" ? "" : e.effect === "-" ? "text-success" : e.effect === "+" ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {e.effect === "+" ? "+" : e.effect === "-" ? "−" : ""}₹{inr(e.amount)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.hasTime
                    ? new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : new Date(e.at + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                  {e.detail && <> · {e.detail}</>}
                </div>
                {e.kind !== "vendor" && (
                  <div className="mt-1 text-xs">
                    <span className="text-muted-foreground">Owed after this: </span>
                    <span className="font-medium">₹{inr(Math.max(e.balanceAfter, 0))}</span>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <ShowMore
        shown={limit}
        total={ordered.length}
        onMore={() => setLimit((n) => n + STEP)}
        onLess={() => setLimit(FIRST)}
      />
    </Card>
  )
}
