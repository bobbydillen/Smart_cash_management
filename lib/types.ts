/* ================= PAYMENTS ================= */

export interface Payment
{
  time: Date | string
  description: string
  amount: number
  type?: "IN" | "OUT" // optional for backward compatibility
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
  openingVerifiedAt?: Date | string

  /* ✅ Closing person name */
  closedBy?: string

  openingCash: number
  openingCoins: number
  openingDenominations: DenominationCount

  payments: Payment[]
  sales: SalesData

  closingDenominations: DenominationCount
  nextDayOpeningCash?: number
  nextDayOpeningDenominations?: DenominationCount

  submittedExpectedCash?: number
  submittedActualCash?: number
  submittedShortage?: number

  status: "open" | "submitted" | "confirmed"

  submittedAt?: Date | string
  confirmedAt?: Date | string
  confirmedBy?: string

  createdAt: Date | string
  updatedAt: Date | string
}

/* ================= CALCULATIONS ================= */

/**
 * OLD helper – keeps backward compatibility
 * (treats all payments as OUT)
 */
export function calculateTotalPayments ( payments: Payment[] ): number
{
  return payments.reduce( ( sum, p ) => sum + p.amount, 0 )
}

/**
 * NEW helper – separates IN / OUT
 */
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

/**
 * CASH SALES (unchanged)
 */
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

/**
 * OLD expected cash formula (kept for compatibility)
 */
export function calculateExpectedCash (
  openingCash: number,
  cashSales: number,
  totalPayments: number
): number
{
  return openingCash + cashSales - totalPayments
}

/**
 * NEW correct expected cash formula (IN / OUT aware)
 */
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

export const calculateDenominationTotal = calculateClosingCash

