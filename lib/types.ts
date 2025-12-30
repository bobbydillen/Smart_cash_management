export interface Payment {
  time: Date | string // Allow both Date and string for serialization
  description: string
  amount: number
}

export interface SalesData {
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

export interface DenominationCount {
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

export interface DayEntry {
  _id?: string
  counterName: string
  date: string // YYYY-MM-DD
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
  submittedAt?: Date | string // Allow both Date and string for serialization
  confirmedAt?: Date | string // Allow both Date and string for serialization
  confirmedBy?: string
  createdAt: Date | string // Allow both Date and string for serialization
  updatedAt: Date | string // Allow both Date and string for serialization
}

export function calculateTotalPayments(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

export function calculateCashSales(sales: SalesData, isFashionBoth: boolean): number {
  if (isFashionBoth) {
    const martCash = (sales.martTotalSales || 0) - (sales.martCardUpi || 0) - (sales.martCredit || 0)
    const fashionCash = (sales.fashionTotalSales || 0) - (sales.fashionCardUpi || 0) - (sales.fashionCredit || 0)
    return martCash + fashionCash
  }
  return sales.totalSales - sales.cardUpiSales - sales.creditSales
}

export function calculateExpectedCash(openingCash: number, cashSales: number, totalPayments: number): number {
  return openingCash + cashSales - totalPayments
}

export function calculateClosingCash(denominations: DenominationCount): number {
  return (
    (denominations.notes500 || 0) * 500 +
    (denominations.notes200 || 0) * 200 +
    (denominations.notes100 || 0) * 100 +
    (denominations.notes50 || 0) * 50 +
    (denominations.notes20 || 0) * 20 +
    (denominations.notes10 || 0) * 10 +
    (denominations.coins10 || 0) * 10 +
    (denominations.coins5 || 0) * 5 +
    (denominations.coins2 || 0) * 2 +
    (denominations.coins1 || 0) * 1
  )
}

export const calculateDenominationTotal = calculateClosingCash
