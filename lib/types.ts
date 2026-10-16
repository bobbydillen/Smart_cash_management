/* ================= PAYMENTS ================= */

export interface Payment
{
  time: Date | string
  description: string
  amount: number
  type?: "IN" | "OUT" // optional for backward compatibility
  transferId?: string // set when this movement is one side of a cash transfer
  vendorPaymentId?: string // set when this was a payment to a vendor (see the purchase records)
}

/* ================= SALES ================= */

export interface SalesData
{
  totalSales: number
  cardUpiSales: number
  creditSales: number

  // Calculated field for regular counters
  cashSales?: number
  martCashSales?: number
  fashionCashSales?: number

  // For Smart Fashion (Both) counter only
  martTotalSales?: number
  fashionTotalSales?: number
  martCardUpi?: number
  fashionCardUpi?: number
  martCredit?: number
  fashionCredit?: number
}

/* ================= DENOMINATIONS ================= */

export interface DenominationCount
{
  notes500: number
  notes200: number
  notes100: number
  notes50: number
  notes20: number
  notes10: number
  coins10: number
  coins5: number
  coins2: number
  coins1: number
}

/* ================= DAY ENTRY ================= */

export interface DayEntry
{
  _id?: string
  counterName: string
  date: string // YYYY-MM-DD

  /* ✅ Opening verification (NO calculation impact) */
  openingVerified?: boolean
  openingVerifiedAt?: Date | string | null
  openingVerifiedBy?: string
  /** "verified" = counted and matched; "not_verified" = flagged with a note */
  openingVerifyStatus?: "verified" | "not_verified"
  openingNote?: string
  /** set while an admin override is active; removed again by a revert */
  openingOverride?: {
    by: string
    at: Date | string
    fromCash: number
  }
  /** earlier versions of the opening check, kept when it is edited */
  openingHistory?: Array<{
    status: "verified" | "not_verified"
    by?: string
    note?: string
    at?: Date | string | null
    replacedAt: Date | string
  }>
  openingCheckedDenoms?: string[]

  /* ✅ Closing person name */
  closedBy?: string

  openingCash: number
  openingDenominations: DenominationCount

  payments: Payment[]
  sales: SalesData

  closingDenominations: DenominationCount
  nextDayOpeningCash?: number
  nextDayOpeningDenominations?: DenominationCount
  /** notes amount the counter asked for; set when the next-day opening is confirmed */
  nextDayNotesRequested?: number
  /** available-cash rows the counter ticked, as "<denomination>:<count>" */
  availableCheckedDenoms?: string[]
  /** counter confirmed the available cash was checked (tied to the amount below) */
  availableCashHandedOver?: boolean
  availableCashHandedOverAmount?: number
  availableCashHandedOverAt?: Date | string | null

  submittedExpectedCash?: number
  submittedActualCash?: number
  submittedShortage?: number

  status: "open" | "submitted" | "confirmed"

  submittedAt?: Date | string
  confirmedAt?: Date | string
  confirmedBy?: string

  createdAt: Date | string
  updatedAt: Date | string
  paymentRefNumber?: string
}

/* ================= CALCULATIONS ================= */

/** Splits payments into money in and money out (a missing type counts as OUT). */
export function calculatePaymentSummary ( payments: Payment[] )
{
  let totalIn = 0
  let totalOut = 0

  for ( const p of payments || [] )
  {
    const type = p.type || "OUT"
    if ( type === "IN" ) totalIn += p.amount
    else totalOut += p.amount
  }

  return { totalIn, totalOut }
}

/** Cash sales = total - card/UPI - credit (per shop for the "Both" counter) */
export function calculateCashSales (
  sales: SalesData,
  isFashionBoth: boolean
): number
{
  if ( isFashionBoth )
  {
    const martCash =
      ( sales.martTotalSales || 0 ) -
      ( sales.martCardUpi || 0 ) -
      ( sales.martCredit || 0 )

    const fashionCash =
      ( sales.fashionTotalSales || 0 ) -
      ( sales.fashionCardUpi || 0 ) -
      ( sales.fashionCredit || 0 )

    return martCash + fashionCash
  }

  return sales.totalSales - sales.cardUpiSales - sales.creditSales
}

/** Expected cash = opening + cash sales + money in - money out */
export function calculateExpectedCashWithInOut (
  openingCash: number,
  cashSales: number,
  payments: Payment[]
): number
{
  const { totalIn, totalOut } = calculatePaymentSummary( payments )
  return openingCash + cashSales + totalIn - totalOut
}

/**
 * Denomination total
 */
export function calculateClosingCash (
  denominations: DenominationCount
): number
{
  return (
    ( denominations.notes500 || 0 ) * 500 +
    ( denominations.notes200 || 0 ) * 200 +
    ( denominations.notes100 || 0 ) * 100 +
    ( denominations.notes50 || 0 ) * 50 +
    ( denominations.notes20 || 0 ) * 20 +
    ( denominations.notes10 || 0 ) * 10 +
    ( denominations.coins10 || 0 ) * 10 +
    ( denominations.coins5 || 0 ) * 5 +
    ( denominations.coins2 || 0 ) * 2 +
    ( denominations.coins1 || 0 ) * 1
  )
}
