"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import { fail } from "@/lib/action-result"
import { isDateString } from "@/lib/validation"
import { todayIST } from "@/lib/report"
import * as P from "@/lib/purchase-service"

/**
 * Purchase counter actions.
 *  - the purchase user records vendors, bills, payments and closes the day
 *  - the admin and supervisor can look at everything; the admin also confirms days
 * The rules themselves live in lib/purchase-service.ts.
 */

async function asPurchase() {
  const user = await getSession()
  if (!user || user.role !== "purchase") return null
  return { db: await getDatabase(), actor: { username: user.username } }
}

/**
 * Paying vendors and clearing cheques: the purchase counter (from its drawer) and the
 * admin (from the admin's own money). `as` says which one is acting.
 */
async function asPayer() {
  const user = await getSession()
  if (!user || (user.role !== "purchase" && user.role !== "admin")) return null
  return { db: await getDatabase(), actor: { username: user.username }, as: user.role as "purchase" | "admin" }
}

/** The purchase counter and the admin can both keep the list of banks. */
async function asBankManager() {
  const user = await getSession()
  if (!user || (user.role !== "purchase" && user.role !== "admin")) return null
  return { db: await getDatabase(), actor: { username: user.username } }
}

async function asViewer() {
  const user = await getSession()
  if (!user || (user.role !== "purchase" && user.role !== "admin" && user.role !== "supervisor")) return null
  return { db: await getDatabase(), actor: { username: user.username }, role: user.role }
}

const DENIED = fail("Only the purchase counter or the admin can do this")

/* ================= READ ================= */

export async function loadVendors() {
  const c = await asViewer()
  return c ? P.listVendors(c.db) : []
}

export async function loadVendorDetail(id: string) {
  const c = await asViewer()
  return c ? P.getVendorDetail(c.db, id) : null
}

export async function loadDayView(date?: string) {
  const c = await asViewer()
  if (!c) return null
  const day = date && isDateString(date) ? date : todayIST()
  // only the purchase counter creates today's day by opening it
  return P.getDayView(c.db, day, c.role === "purchase" && day === todayIST())
}

export async function loadCheques() {
  const c = await asViewer()
  return c ? P.listCheques(c.db) : []
}

export async function loadVouchers() {
  const c = await asViewer()
  return c ? P.listVouchers(c.db) : []
}

export async function loadDayReport(start: string, end: string) {
  const c = await asViewer()
  return c ? P.getDayReport(c.db, start, end) : []
}

/* ================= BANKS ================= */

export async function loadBanks() {
  const c = await asViewer()
  return c ? P.listBanks(c.db) : []
}

export async function addBank(name: string) {
  const c = await asBankManager()
  return c ? P.addBank(c.db, c.actor, name) : fail("Only the admin or the purchase counter can change the banks")
}

export async function toggleBank(id: string, active: boolean) {
  const c = await asBankManager()
  return c ? P.setBankActive(c.db, id, active) : fail("Only the admin or the purchase counter can change the banks")
}

/* ================= VENDORS ================= */

export async function addVendor(input: P.VendorInput) {
  const c = await asPurchase()
  return c ? P.createVendor(c.db, c.actor, input) : DENIED
}

export async function editVendor(id: string, input: P.VendorInput) {
  const c = await asPurchase()
  return c ? P.updateVendor(c.db, id, input) : DENIED
}

export async function toggleVendor(id: string, active: boolean) {
  const c = await asPurchase()
  return c ? P.setVendorActive(c.db, id, active) : DENIED
}

/* ================= BILLS ================= */

export async function addBill(input: P.BillInput) {
  const c = await asPurchase()
  return c ? P.createBill(c.db, c.actor, input) : DENIED
}

export async function editBill(id: string, input: P.BillInput) {
  const c = await asPurchase()
  return c ? P.updateBill(c.db, id, input) : DENIED
}

export async function removeBill(id: string) {
  const c = await asPurchase()
  return c ? P.deleteBill(c.db, id) : DENIED
}

/* ================= PAYMENTS, CHEQUES, VOUCHERS ================= */

export async function makePayment(input: P.PaymentInput) {
  const c = await asPayer()
  return c ? P.recordPayment(c.db, c.actor, input, c.as) : DENIED
}

export async function makeReturn(input: P.ReturnInput) {
  const c = await asPayer()
  return c ? P.recordReturn(c.db, c.actor, input, c.as) : DENIED
}

export async function cancelVendorReturn(id: string) {
  const c = await asPayer()
  return c ? P.cancelReturn(c.db, id, c.as) : DENIED
}

export async function settleVoucher(input: Parameters<typeof P.settleVoucher>[2]) {
  const c = await asPayer()
  return c ? P.settleVoucher(c.db, c.actor, input, c.as) : DENIED
}

export async function cancelCashPayment(paymentId: string) {
  const c = await asPayer()
  return c ? P.cancelCashPayment(c.db, paymentId, c.as) : DENIED
}

export async function changeChequeStatus(id: string, status: "cleared" | "bounced" | "cancelled") {
  const c = await asPayer()
  return c ? P.setChequeStatus(c.db, id, status) : DENIED
}

export async function cancelVoucher(id: string) {
  const c = await asPayer()
  return c ? P.cancelVoucher(c.db, id) : DENIED
}

/* ================= THE DAY ================= */

export async function saveClosingCount(denominations: unknown, keep?: unknown) {
  const c = await asPurchase()
  return c ? P.updateClosing(c.db, denominations, keep) : DENIED
}

export async function addCashReceived(input: { from?: string; denominations: unknown; note?: string; receivedBy: string }) {
  const c = await asPurchase()
  return c ? P.recordCashReceived(c.db, input) : DENIED
}

export async function addMoneyMove(direction: "in" | "out", input: { amount: string; reason: string; by: string }) {
  const c = await asPurchase()
  return c ? P.recordMoneyMove(c.db, direction, input) : DENIED
}

export async function removeCashMove(id: string) {
  const c = await asPurchase()
  return c ? P.cancelCashMove(c.db, id) : DENIED
}

export async function submitPurchaseDay(closedBy: string) {
  const c = await asPurchase()
  return c ? P.submitDay(c.db, c.actor, closedBy) : DENIED
}

/** Admin only */
export async function confirmPurchaseDay(date: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")
  return P.confirmDay(await getDatabase(), { username: user.username }, date)
}

/** Admin only */
export async function unlockPurchaseDay(date: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")
  return P.unlockDay(await getDatabase(), date)
}

/** Admin only: the cash handed over at closing has been received */
export async function acknowledgePurchaseHandover(date: string) {
  const user = await getSession()
  if (!user || user.role !== "admin") return fail("Unauthorized")
  return P.acknowledgeHandover(await getDatabase(), { username: user.username }, date)
}
