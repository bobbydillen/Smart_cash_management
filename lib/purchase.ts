import type { DenominationCount } from "./types"

/**
 * Purchase counter: types and the money rules, shared by server and screens.
 *
 * How balances work
 * -----------------
 *  - A vendor is owed:   opening balance + all bills
 *  - Every payment reduces what is owed, whatever the mode: cash, cheque, or a
 *    voucher given in place of payment.
 *  - A voucher is a promise to pay later. The bill counts as paid when the voucher
 *    is issued, but the voucher stays a debt ("pending") until it is settled with
 *    cash or a cheque. Settling it does not reduce the bills again.
 *  - A bounced / cancelled cheque or a cancelled voucher voids its payment, which
 *    puts the amount back on the bill.
 *
 *  total to pay = (opening + bills - payments) + pending vouchers
 */

export type PayMode = "cash" | "cheque" | "voucher"

export const MODE_LABEL: Record<PayMode, string> = {
  cash: "Cash",
  cheque: "Cheque",
  voucher: "Voucher",
}

export interface Vendor {
  _id: string
  name: string
  phone?: string
  address?: string
  gstin?: string
  /** what this vendor supplies */
  items?: string
  notes?: string
  /** amount already owed when the vendor was added */
  openingBalance: number
  active: boolean
  createdAt: string
}

export interface Bill {
  _id: string
  vendorId: string
  billNumber: string
  billDate: string
  amount: number
  items?: string
  dueDate?: string
  notes?: string
  createdAt: string
  createdBy: string
}

export interface BillWithStatus extends Bill {
  paid: number
  outstanding: number
  status: "unpaid" | "part" | "paid"
}

/** Who paid: the purchase counter's own drawer, the admin, or a shop counter. */
export type PaymentSource = "purchase" | "admin" | "counter"

export const SOURCE_LABEL: Record<PaymentSource, string> = {
  purchase: "Purchase counter",
  admin: "Admin",
  counter: "Counter",
}

export interface PurchasePayment {
  _id: string
  vendorId: string
  /** the bill it pays; empty for a payment on account or a voucher settlement */
  billId?: string | null
  date: string
  amount: number
  mode: PayMode
  /** cheque number or voucher number */
  reference?: string
  chequeId?: string
  voucherId?: string
  /** set when this payment settles an earlier voucher */
  settlesVoucherId?: string
  /** when a cancelled / bounced payment was taken back */
  voidedAt?: string
  /** missing on older records, which were all made by the purchase counter */
  source?: PaymentSource
  /** the counter's name when a shop counter paid */
  sourceName?: string
  note?: string
  paidBy: string
  voided?: boolean
  createdAt: string
  createdBy: string
}

export interface Bank {
  _id: string
  name: string
  active: boolean
}

export type ChequeStatus = "issued" | "cleared" | "bounced" | "cancelled"

export interface Cheque {
  _id: string
  vendorId: string
  billId?: string | null
  number: string
  bank: string
  /** the date written on the cheque (may be in the future) */
  chequeDate: string
  amount: number
  status: ChequeStatus
  issuedDate: string
  paymentId: string
  note?: string
  clearedAt?: string
  /** when it was marked cleared, bounced or cancelled */
  statusChangedAt?: string
}

export type VoucherStatus = "pending" | "settled" | "cancelled"

export interface Voucher {
  _id: string
  vendorId: string
  billId?: string | null
  number: string
  amount: number
  issuedDate: string
  /** when the vendor was told they would be paid */
  promisedDate?: string
  status: VoucherStatus
  paymentId: string
  settledAt?: string
  settledPaymentId?: string
  cancelledAt?: string
  note?: string
}

export interface VendorBalance {
  opening: number
  billed: number
  paid: number
  /** opening + billed - paid */
  billsOutstanding: number
  vouchersPending: number
  /** what we still have to pay this vendor */
  totalToPay: number
}

export const round2 = (n: number) => Math.round(n * 100) / 100

export function vendorBalance(
  opening: number,
  billed: number,
  paid: number,
  vouchersPending: number
): VendorBalance {
  const billsOutstanding = round2(opening + billed - paid)
  return {
    opening: round2(opening),
    billed: round2(billed),
    paid: round2(paid),
    billsOutstanding,
    vouchersPending: round2(vouchersPending),
    totalToPay: round2(billsOutstanding + vouchersPending),
  }
}

export function billStatus(amount: number, paid: number): "unpaid" | "part" | "paid" {
  if (paid <= 0.004) return "unpaid"
  return paid >= amount - 0.004 ? "paid" : "part"
}

/* ================= DAILY CASH ================= */

export interface CashMove {
  id: string
  transferId?: string
  /** where it came from / went to */
  party: string
  amount: number
  time: string
  note?: string
  /**
   * "received": cash handed straight to the staff, counted by denomination
   * "other-in" / "other-out": any other money in or out, with a reason
   * missing: a cash transfer through the portal
   */
  kind?: "received" | "other-in" | "other-out"
  denominations?: DenominationCount
  /** the purchase staff member who recorded it */
  by?: string
}

export interface PurchaseDay {
  _id: string
  date: string
  openingCash: number
  openingDenominations: DenominationCount
  cashIn: CashMove[]
  cashOut: CashMove[]
  closingDenominations: DenominationCount
  /** the cash kept in the drawer for tomorrow; the rest is handed over to the admin */
  nextDayOpeningDenominations?: DenominationCount
  handoverDenominations?: DenominationCount
  handoverAmount?: number
  handoverReceivedAt?: string
  handoverReceivedBy?: string
  status: "open" | "submitted" | "confirmed"
  closedBy?: string
  submittedAt?: string
  confirmedAt?: string
  confirmedBy?: string
  submittedExpectedCash?: number
  submittedActualCash?: number
  submittedShortage?: number
  createdAt: string
}

export interface DaySummary {
  opening: number
  received: number
  sentOut: number
  paidCash: number
  expected: number
  counted: number
  /** expected - counted: positive = shortage */
  shortage: number
  paidCheque: number
  paidVoucher: number
  /** everything paid today, whatever the mode */
  paidTotal: number
  vendorsPaid: number
  paymentCount: number
  /** paid by the admin (any mode); does not touch the purchase drawer */
  paidByAdmin: number
  /** paid in cash by shop counters; recorded on their own pages */
  paidByCounters: number
  /** counted cash that stays for tomorrow */
  keep: number
  /** counted cash handed over to the admin (counted - keep) */
  handover: number
}

/** Cash that should be in the drawer: opening + received - sent out - cash paid. */
export function expectedPurchaseCash(
  opening: number,
  received: number,
  sentOut: number,
  paidCash: number
): number {
  return round2(opening + received - sentOut - paidCash)
}

/* ================= VENDOR TIMELINE ================= */

export type TimelineKind = "vendor" | "bill" | "payment" | "cheque" | "voucher" | "reversal"

export interface TimelineEvent {
  /** when it happened (bills use the bill date, with no time) */
  at: string
  hasTime: boolean
  kind: TimelineKind
  title: string
  detail?: string
  /** a rupee amount to show with the event */
  amount?: number
  /** +  adds to what we owe, - reduces it, 0 changes nothing */
  effect: "+" | "-" | "0"
  /** what we owe the vendor after this event */
  balanceAfter: number
}

/** "Purchase counter (handled by Ravi)", "Admin", "Smart Mart Counter 1" */
export function payerLabel(p: Pick<PurchasePayment, "source" | "sourceName" | "paidBy">): string {
  if (p.source === "admin") return `Admin${p.paidBy ? ` (${p.paidBy})` : ""}`
  if (p.source === "counter") return p.sourceName || p.paidBy || "Counter"
  return `Purchase counter${p.paidBy ? ` (handled by ${p.paidBy})` : ""}`
}

/**
 * Everything that happened with a vendor, oldest first, with what is owed after each step.
 * The last balance always equals the vendor's "total to pay".
 */
export function buildTimeline(input: {
  vendor: Vendor
  bills: Pick<Bill, "_id" | "billNumber" | "billDate" | "amount" | "items" | "dueDate" | "createdBy" | "createdAt">[]
  payments: PurchasePayment[]
  cheques: Cheque[]
  vouchers: Voucher[]
}): TimelineEvent[] {
  const { vendor, bills, payments, cheques, vouchers } = input
  const billNo = new Map(bills.map((b) => [b._id, b.billNumber]))
  const chequeById = new Map(cheques.map((c) => [c._id, c]))
  const voucherById = new Map(vouchers.map((v) => [v._id, v]))

  type Draft = Omit<TimelineEvent, "balanceAfter"> & { key: string }
  const events: Draft[] = []

  events.push({
    key: "0",
    at: vendor.createdAt,
    hasTime: true,
    kind: "vendor",
    title: "Added as a vendor",
    detail: vendor.openingBalance > 0 ? `Already owed ₹${round2(vendor.openingBalance).toFixed(2)} when added` : undefined,
    effect: "0",
  })

  for (const b of bills) {
    events.push({
      key: `${b.billDate}T00:00:00.000Z`,
      at: b.billDate,
      hasTime: false,
      kind: "bill",
      title: `Bill ${b.billNumber} received`,
      detail: [b.items, b.dueDate ? `due ${b.dueDate}` : null, b.createdBy ? `entered by ${b.createdBy}` : null].filter(Boolean).join(" · ") || undefined,
      amount: b.amount,
      effect: "+",
    })
  }

  for (const p of payments) {
    const cheque = p.chequeId ? chequeById.get(p.chequeId) : undefined
    const voucher = p.voucherId ? voucherById.get(p.voucherId) : undefined
    const settled = p.settlesVoucherId ? voucherById.get(p.settlesVoucherId) : undefined
    const forBill = p.billId ? billNo.get(p.billId) : undefined

    let title: string
    let effect: "+" | "-" | "0" = "-"
    if (p.settlesVoucherId) {
      title = `Voucher ${settled?.number ?? ""} settled ${p.mode === "cheque" ? `by cheque ${p.reference ?? ""}` : "in cash"}`.replace(/\s+/g, " ").trim()
    } else if (p.mode === "voucher") {
      title = `Voucher ${p.reference ?? voucher?.number ?? ""} given instead of payment`.replace(/\s+/g, " ")
      effect = "0" // the bill is covered, but the voucher is still owed
    } else if (p.mode === "cheque") {
      title = `Paid by cheque ${p.reference ?? ""}`.trim()
    } else {
      title = "Paid in cash"
    }

    const detail = [
      forBill ? `for bill ${forBill}` : p.settlesVoucherId ? undefined : "on account",
      cheque ? `${cheque.bank}, dated ${cheque.chequeDate}` : undefined,
      voucher?.promisedDate ? `promised by ${voucher.promisedDate}` : undefined,
      `by ${payerLabel(p)}`,
      p.note,
    ]
      .filter(Boolean)
      .join(" · ")

    events.push({ key: p.createdAt, at: p.createdAt, hasTime: true, kind: "payment", title, detail, amount: p.amount, effect })

    // a payment taken back (cheque bounced / cancelled, voucher cancelled, cash cancelled)
    if (p.voided && p.voidedAt) {
      const why = cheque
        ? `Cheque ${cheque.number} ${cheque.status === "bounced" ? "bounced" : "cancelled"}`
        : voucher
          ? `Voucher ${voucher.number} cancelled`
          : p.settlesVoucherId
            ? "Settlement taken back"
            : "Cash payment cancelled"
      events.push({
        key: p.voidedAt,
        at: p.voidedAt,
        hasTime: true,
        kind: "reversal",
        title: why,
        detail: effect === "0" ? "The bill is unpaid again" : "Added back to what we owe",
        amount: p.amount,
        effect: effect === "0" ? "0" : "+",
      })
    }
  }

  for (const c of cheques) {
    if (c.status === "cleared" && c.clearedAt) {
      events.push({
        key: c.clearedAt,
        at: c.clearedAt,
        hasTime: true,
        kind: "cheque",
        title: `Cheque ${c.number} cleared by the bank`,
        detail: c.bank,
        amount: c.amount,
        effect: "0",
      })
    }
  }

  events.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  let balance = vendor.openingBalance > 0 ? vendor.openingBalance : 0
  return events.map(({ key: _key, ...e }) => {
    if (e.effect === "+" && e.amount) balance += e.amount
    if (e.effect === "-" && e.amount) balance -= e.amount
    return { ...e, balanceAfter: round2(balance) }
  })
}
