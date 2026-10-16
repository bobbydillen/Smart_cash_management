"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import type { DayEntry, DenominationCount, SalesData } from "@/lib/types"
import {
  calculateCashSales,
  calculateClosingCash,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import {
  COIN_KEYS,
  NOTE_KEYS,
  deriveNextDay,
  cleanDenoms,
  emptyDenoms,
  subtractDenoms,
} from "@/lib/next-day"
import {
  carryForward,
  entriesCollection,
  findEntry,
  findPreviousClosedEntry,
  serializeEntry,
  type EntryDoc,
} from "@/lib/entries"
import { cleanSales, isDateString, parseMoney, parseText } from "@/lib/validation"
import { fail, ok } from "@/lib/action-result"
import { todayIST } from "@/lib/report"
import * as Purchase from "@/lib/purchase-service"
import { groupFilter } from "@/lib/incharge-group"
import { redirect } from "next/navigation"

/* =====================================================
   SHARED HELPERS
   ===================================================== */

type Db = Awaited<ReturnType<typeof getDatabase>>


/** The signed-in counter, the date being worked on, and the database. */
async function counterContext ( date?: string )
{
  const user = await getSession()
  if ( !user || user.role !== "counter" || !user.counterName )
    return fail( "Unauthorized" )
  if ( date !== undefined && !isDateString( date ) ) return fail( "Invalid date" )

  return {
    counterName: user.counterName,
    date: date ?? todayIST(),
    db: await getDatabase(),
  }
}

type Ctx = Exclude<Awaited<ReturnType<typeof counterContext>>, { error: string }>

/**
 * Gate for every counter write: the day must exist, still be open, and the
 * opening cash must have been verified first.
 */
async function editableEntry ( ctx: Ctx ): Promise<{ entry: EntryDoc } | { error: string }>
{
  const entry = await findEntry( ctx.db, ctx.counterName, ctx.date )
  if ( !entry ) return fail( "Entry not found" )
  if ( entry.status !== "open" ) return fail( "This day is locked" )
  if ( !entry.openingVerified )
    return fail( "Verify the opening cash before entering any cash movement" )
  return { entry }
}

/**
 * Older entries stored the opening AMOUNT but not its denominations.
 * When they are missing, copy them from the previous closed day (only if that
 * adds up to exactly the same amount), so the opening verification can show and
 * tick each denomination.
 */
async function withOpeningDenominations ( db: Db, entry: EntryDoc ): Promise<EntryDoc>
{
  const current = { ...emptyDenoms(), ...( entry.openingDenominations || {} ) }
  if ( calculateClosingCash( current ) > 0 || !( entry.openingCash > 0 ) ) return entry

  const prev = await findPreviousClosedEntry( db, entry.counterName, entry.date )
  const { cash, denominations } = carryForward( prev )
  if ( !prev || calculateClosingCash( denominations ) !== entry.openingCash || cash !== entry.openingCash )
    return entry

  await entriesCollection( db ).updateOne(
    { _id: entry._id },
    { $set: { openingDenominations: denominations } }
  )
  return { ...entry, openingDenominations: denominations }
}

/**
 * Available cash = closing minus next-day opening, per denomination.
 * `keys` are the "<denomination>:<count>" ticks the counter has to make.
 */
function availableCashInfo ( entry: EntryDoc )
{
  const avail = subtractDenoms( entry.closingDenominations, entry.nextDayOpeningDenominations )
  const keys = ( Object.keys( avail ) as ( keyof DenominationCount )[] )
    .filter( k => avail[ k ] > 0 )
    .map( k => `${ k }:${ avail[ k ] }` )
  return { total: calculateClosingCash( avail ), keys }
}

const allTicked = ( keys: string[], ticked?: string[] ) =>
  keys.every( k => ( ticked || [] ).includes( k ) )

/* =====================================================
   READ
   ===================================================== */

export async function getTodayEntry (): Promise<DayEntry | null>
{
  const user = await getSession()
  if ( !user || user.role !== "counter" || !user.counterName )
  {
    redirect( "/" )
  }

  const db = await getDatabase()
  const today = todayIST()

  let entry = await findEntry( db, user.counterName, today )

  if ( !entry )
  {
    // a new day opens with what the last closed day kept for it
    const prev = await findPreviousClosedEntry( db, user.counterName, today )
    const { cash, denominations } = carryForward( prev )
    const now = new Date()

    // upsert: two requests at the same moment still create only one entry
    entry = await entriesCollection( db ).findOneAndUpdate(
      { counterName: user.counterName, date: today },
      {
        $setOnInsert: {
          openingCash: cash,
          openingDenominations: denominations,
          openingVerified: false,
          openingVerifiedAt: null,
          payments: [],
          sales: { totalSales: 0, cardUpiSales: 0, creditSales: 0 },
          closingDenominations: emptyDenoms(),
          status: "open" as const,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    )
  }

  if ( !entry ) return null
  return serializeEntry( await withOpeningDenominations( db, entry ) )
}

export async function getEntryByDate ( date: string )
{
  const user = await getSession()
  if ( !user || user.role !== "counter" || !user.counterName )
  {
    redirect( "/" )
  }
  if ( !isDateString( date ) ) return null

  const db = await getDatabase()
  const entry = await findEntry( db, user.counterName, date )

  return entry ? serializeEntry( await withOpeningDenominations( db, entry ) ) : null
}

/**
 * Opening cash for a day, used by the Sales and Closing pages.
 * A verified (or admin-corrected) entry uses its own figure; otherwise it is
 * what the previous closed day kept.
 */
export async function getOpeningCashForDate ( date: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const entry = await findEntry( ctx.db, ctx.counterName, ctx.date )
  if ( entry && entry.openingVerified === true && typeof entry.openingCash === "number" )
  {
    return ok( { date: ctx.date, cash: entry.openingCash } )
  }

  const prev = await findPreviousClosedEntry( ctx.db, ctx.counterName, ctx.date )
  return ok( { date: prev?.date ?? ctx.date, cash: carryForward( prev ).cash } )
}

/* =====================================================
   OPENING VERIFICATION
   ===================================================== */

export async function verifyOpeningCash (
  date: string | undefined,
  verifiedBy: string,
  checkedDenoms: string[],
  status: "verified" | "not_verified" = "verified",
  note: string = ""
)
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const name = parseText( verifiedBy, 80 )
  if ( !name ) return fail( "Select the person verifying the cash" )
  if ( status !== "verified" && status !== "not_verified" ) return fail( "Invalid status" )

  // the name must be one of the in-charges set up by the admin
  const incharge = await ctx.db.collection( "incharges" ).findOne( { name, active: true, ...groupFilter( "counter" ) } )
  if ( !incharge ) return fail( "Select a valid in-charge name" )

  const entry = await findEntry( ctx.db, ctx.counterName, ctx.date )
  if ( !entry ) return fail( "Entry not found" )
  if ( entry.status !== "open" ) return fail( "This day is locked" )

  const cleanNote = ( typeof note === "string" ? note : "" ).trim()
  if ( status === "not_verified" && !cleanNote )
    return fail( "Write a note explaining why it could not be verified" )
  if ( cleanNote.length > 500 ) return fail( "Note is too long" )

  // only known denominations can be ticked
  const denoms = { ...emptyDenoms(), ...( entry.openingDenominations || {} ) }
  const known = Object.keys( denoms ) as ( keyof DenominationCount )[]
  const ticked = ( Array.isArray( checkedDenoms ) ? checkedDenoms : [] ).filter(
    ( k ): k is keyof DenominationCount => known.includes( k as keyof DenominationCount )
  )

  // every denomination that holds cash must be ticked (only to verify)
  const required = known.filter( k => ( denoms[ k ] || 0 ) > 0 )
  if ( status === "verified" && required.some( k => !ticked.includes( k ) ) )
    return fail( "Tick every denomination after counting it" )

  // editing an earlier check: keep the old version in the history
  const previous = entry.openingVerified
    ? {
      status: entry.openingVerifyStatus || "verified",
      by: entry.openingVerifiedBy,
      note: entry.openingNote || "",
      at: entry.openingVerifiedAt,
      replacedAt: new Date(),
    }
    : null

  await entriesCollection( ctx.db ).updateOne(
    { _id: entry._id, status: "open" },
    {
      ...( previous ? { $push: { openingHistory: previous } } : {} ),
      $set: {
        // "verified" means the opening check was completed, which unlocks the
        // day; openingVerifyStatus tells which outcome it was
        openingVerified: true,
        openingVerifyStatus: status,
        openingNote: status === "not_verified" ? cleanNote : "",
        openingVerifiedAt: new Date(),
        openingVerifiedBy: name,
        openingCheckedDenoms: status === "verified" ? required : ticked,
        updatedAt: new Date(),
      },
    }
  )

  return ok()
}

/* =====================================================
   PAYMENTS
   ===================================================== */

const CHANGED = "This entry was changed on another screen. Refresh and try again."

export async function addPayment (
  description: string,
  amount: number,
  type: "IN" | "OUT",
  date?: string
)
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const desc = parseText( description, 200 )
  if ( !desc ) return fail( "Enter a description" )
  const amt = parseMoney( amount, { min: 0.01, max: 10_000_000 } )
  if ( amt === null ) return fail( "Enter a valid amount" )
  if ( type !== "IN" && type !== "OUT" ) return fail( "Invalid payment type" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  const added = { description: desc, amount: amt, type, time: new Date().toISOString() }

  await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open" },
    { $push: { payments: added }, $set: { updatedAt: new Date() } }
  )

  return ok( { payments: serializeEntry( { ...e.entry, payments: [ ...e.entry.payments, added ] } ).payments } )
}

export async function updatePayment (
  index: number,
  description: string,
  amount: number,
  type: "IN" | "OUT",
  date?: string
)
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const desc = parseText( description, 200 )
  if ( !desc ) return fail( "Enter a description" )
  const amt = parseMoney( amount, { min: 0.01, max: 10_000_000 } )
  if ( amt === null ) return fail( "Enter a valid amount" )
  if ( type !== "IN" && type !== "OUT" ) return fail( "Invalid payment type" )
  if ( !Number.isInteger( index ) || index < 0 ) return fail( "Payment not found" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  const payments = [ ...( e.entry.payments || [] ) ]
  if ( !payments[ index ] ) return fail( "Payment not found" )
  if ( payments[ index ].transferId )
    return fail( "Cash transfers cannot be edited. Cancel the transfer instead." )
  if ( payments[ index ].vendorPaymentId )
    return fail( "Vendor payments cannot be edited. Cancel it and pay again." )

  payments[ index ] = { ...payments[ index ], description: desc, amount: amt, type }

  // only applies if nobody changed the entry since it was read
  const res = await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open", updatedAt: e.entry.updatedAt },
    { $set: { payments, updatedAt: new Date() } }
  )
  if ( res.matchedCount === 0 ) return fail( CHANGED )

  return ok( { payments: serializeEntry( { ...e.entry, payments } ).payments } )
}

export async function deletePayment ( index: number, date?: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx
  if ( !Number.isInteger( index ) || index < 0 ) return fail( "Payment not found" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  const payments = [ ...( e.entry.payments || [] ) ]
  if ( !payments[ index ] ) return fail( "Payment not found" )
  if ( payments[ index ].transferId )
    return fail( "Cash transfers cannot be deleted. Cancel the transfer instead." )
  if ( payments[ index ].vendorPaymentId )
    return fail( "Vendor payments cannot be deleted. Use Cancel on the payment instead." )

  payments.splice( index, 1 )

  const res = await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open", updatedAt: e.entry.updatedAt },
    { $set: { payments, updatedAt: new Date() } }
  )
  if ( res.matchedCount === 0 ) return fail( CHANGED )

  return ok( { payments: serializeEntry( { ...e.entry, payments } ).payments } )
}

export async function updatePaymentRef ( date: string, ref: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const clean = parseText( ref, 100 )
  if ( !clean ) return fail( "Enter the payment entry number" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open" },
    { $set: { paymentRefNumber: clean, updatedAt: new Date() } }
  )

  return ok()
}

/* =====================================================
   SALES
   ===================================================== */

export async function updateSales ( sales: SalesData, date?: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const cleaned = cleanSales( sales, ctx.counterName === "Smart Fashion (Both)" )
  if ( "error" in cleaned ) return cleaned

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open" },
    { $set: { sales: cleaned.sales, updatedAt: new Date() } }
  )

  return ok()
}

/* =====================================================
   CLOSING CASH
   ===================================================== */

export async function updateClosingCash (
  denominations: DenominationCount,
  date?: string
)
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const clean = cleanDenoms( denominations )
  if ( !clean ) return fail( "Invalid denomination counts" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e
  const { entry } = e

  // Next-day opening follows the closing count:
  //  - once the counter has confirmed it, the chosen notes are capped to what was
  //    counted, and coins follow the closing coins unless edited by hand
  //  - until then it mirrors the full closing count
  const confirmed = typeof entry.nextDayNotesRequested === "number"
  const savedNext = entry.nextDayOpeningDenominations
  const oldClosing = entry.closingDenominations
  const coinsEdited =
    !!savedNext &&
    !!oldClosing &&
    COIN_KEYS.some( k => ( savedNext[ k ] || 0 ) !== ( oldClosing[ k ] || 0 ) )
  const nextDay = confirmed
    ? deriveNextDay( clean, savedNext, { followCoins: !coinsEdited } )
    : { ...clean }
  const nextDayTotal = calculateClosingCash( nextDay )

  await entriesCollection( ctx.db ).updateOne(
    { _id: entry._id, status: "open" },
    {
      $set: {
        closingDenominations: clean,
        nextDayOpeningCash: nextDayTotal,
        nextDayOpeningDenominations: nextDay,
        updatedAt: new Date(),
      },
    }
  )

  return ok( {
    nextDayOpeningCash: nextDayTotal,
    nextDayOpeningDenominations: nextDay,
  } )
}

/* =====================================================
   NEXT DAY OPENING
   ===================================================== */

export async function setNextDayOpening (
  denominations: DenominationCount,
  date?: string,
  requestedNotes?: number
)
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const chosen = cleanDenoms( denominations )
  if ( !chosen ) return fail( "Invalid denomination counts" )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e
  const closing = e.entry.closingDenominations
  if ( !closing ) return fail( "Enter the closing cash first" )

  // never carry more than was counted
  for ( const k of NOTE_KEYS )
  {
    if ( chosen[ k ] > ( closing[ k ] || 0 ) )
      return fail( "Next-day notes cannot exceed the notes counted at closing" )
  }
  for ( const k of COIN_KEYS )
  {
    if ( chosen[ k ] > ( closing[ k ] || 0 ) )
      return fail( "Next-day coins cannot exceed the coins counted at closing" )
  }

  const requested =
    typeof requestedNotes === "number" && Number.isFinite( requestedNotes ) && requestedNotes >= 0
      ? Math.round( requestedNotes )
      : undefined

  // the total is always worked out here from the quantities
  const total = calculateClosingCash( chosen )

  await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open" },
    {
      $set: {
        nextDayOpeningCash: total,
        nextDayOpeningDenominations: chosen,
        ...( requested !== undefined ? { nextDayNotesRequested: requested } : {} ),
        updatedAt: new Date(),
      },
    }
  )

  return ok( { nextDayOpeningCash: total } )
}

/* =====================================================
   AVAILABLE CASH CHECKS
   ===================================================== */

/**
 * Row ticks. Each tick is "<denomination>:<count>", so it only holds for the
 * quantity it was made for.
 */
export async function setAvailableCheckedDenoms ( keys: string[], date?: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  if ( !Array.isArray( keys ) || keys.length > 20 ) return fail( "Invalid ticks" )
  const clean = keys.filter(
    k => typeof k === "string" && /^(notes|coins)\d+:\d{1,7}$/.test( k )
  )

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e

  // "Available cash checked" can only stay on while every row is ticked
  const resetSwitch =
    !!e.entry.availableCashHandedOver && !allTicked( availableCashInfo( e.entry ).keys, clean )

  await entriesCollection( ctx.db ).updateOne(
    { _id: e.entry._id, status: "open" },
    {
      $set: {
        availableCheckedDenoms: clean,
        ...( resetSwitch
          ? { availableCashHandedOver: false, availableCashHandedOverAt: null }
          : {} ),
        updatedAt: new Date(),
      },
    }
  )

  return ok( { switchReset: resetSwitch } )
}

/**
 * The "Available cash checked" switch. The amount is worked out here from the
 * saved counts, so the switch always refers to a specific amount.
 */
export async function setAvailableCashHandover ( checked: boolean, date?: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e
  const { entry } = e

  const info = availableCashInfo( entry )

  if ( checked && typeof entry.nextDayNotesRequested !== "number" )
    return fail( "Confirm the next-day opening cash first" )
  if ( checked && !allTicked( info.keys, entry.availableCheckedDenoms ) )
    return fail( "Tick every available cash denomination first" )

  const at = checked ? new Date() : null

  await entriesCollection( ctx.db ).updateOne(
    { _id: entry._id, status: "open" },
    {
      $set: {
        availableCashHandedOver: !!checked,
        availableCashHandedOverAmount: info.total,
        availableCashHandedOverAt: at,
        updatedAt: new Date(),
      },
    }
  )

  return ok( {
    availableCashHandedOverAmount: info.total,
    availableCashHandedOverAt: at ? at.toISOString() : null,
  } )
}

/* =====================================================
   SUBMIT DAY
   ===================================================== */

export async function submitDay ( date?: string, closedBy?: string )
{
  const ctx = await counterContext( date )
  if ( "error" in ctx ) return ctx

  const e = await editableEntry( ctx )
  if ( "error" in e ) return e
  const { entry } = e

  // "Closed by" must be one of the in-charges set up by the admin
  const closer = parseText( closedBy, 80 )
  const incharge = closer
    ? await ctx.db.collection( "incharges" ).findOne( { name: closer, active: true, ...groupFilter( "counter" ) } )
    : null
  if ( !closer || !incharge ) return fail( "Select a valid in-charge for Closed By" )

  if ( entry.payments.length > 0 && !entry.paymentRefNumber )
    return fail( "Payment entry number is required because payments were recorded" )

  if ( typeof entry.nextDayNotesRequested !== "number" )
    return fail( "Confirm the next-day opening cash before submitting" )

  // available cash must have been checked row by row, then confirmed
  const avail = availableCashInfo( entry )
  if (
    !allTicked( avail.keys, entry.availableCheckedDenoms ) ||
    entry.availableCashHandedOver !== true ||
    Math.abs( ( entry.availableCashHandedOverAmount ?? -1 ) - avail.total ) > 0.005
  )
    return fail(
      "Tick every available cash denomination and turn on \"Available cash checked\" before submitting"
    )

  const cashSales = calculateCashSales( entry.sales, entry.counterName === "Smart Fashion (Both)" )
  const expectedCash = calculateExpectedCashWithInOut( entry.openingCash, cashSales, entry.payments )
  const actualCash = calculateClosingCash( entry.closingDenominations )

  // the status filter makes a double submit harmless: only the first one applies
  const res = await entriesCollection( ctx.db ).updateOne(
    { _id: entry._id, status: "open" },
    {
      $set: {
        status: "submitted",
        submittedExpectedCash: expectedCash,
        submittedActualCash: actualCash,
        submittedShortage: expectedCash - actualCash,
        closedBy: closer,
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  )
  if ( res.matchedCount === 0 ) return fail( "This day was already submitted" )

  return ok()
}

/* =====================================================
   PAYING A VENDOR FROM THE COUNTER
   The payment shows as "Money out" here and also reduces what the
   vendor is owed in the purchase records; both succeed or neither does.
   ===================================================== */

/** The vendors a counter can pay. */
export async function loadCounterVendors ()
{
  const ctx = await counterContext()
  if ( "error" in ctx ) return []
  return Purchase.listCounterVendors( ctx.db )
}

/** The vouchers still waiting to be paid for a vendor, so the counter can pay them. */
export async function loadVendorVouchers ( vendorId: string )
{
  const ctx = await counterContext()
  if ( "error" in ctx ) return []
  return Purchase.listVendorVouchersForCounter( ctx.db, vendorId )
}

/** Pay a voucher that was given to a vendor earlier, in cash. */
export async function payVoucher ( voucherId: string )
{
  const ctx = await counterContext()
  if ( "error" in ctx ) return ctx
  const user = await getSession()
  return Purchase.settleVoucherFromCounter(
    ctx.db,
    { counterName: ctx.counterName, username: user?.username ?? ctx.counterName },
    voucherId
  )
}

/** Pay a NEW bill: the bill is recorded and paid (fully or in part) in one step. */
export async function payVendor (
  input: {
    vendorId: string
    billNumber: string
    billDate?: string
    billAmount: number
    items?: string
    amount: number
    note?: string
  }
)
{
  const ctx = await counterContext()
  if ( "error" in ctx ) return ctx
  const user = await getSession()
  return Purchase.recordCounterVendorPayment(
    ctx.db,
    { counterName: ctx.counterName, username: user?.username ?? ctx.counterName },
    { ...input, mode: "cash" }
  )
}

export async function cancelVendorPayment ( vendorPaymentId: string )
{
  const ctx = await counterContext()
  if ( "error" in ctx ) return ctx
  const user = await getSession()
  return Purchase.cancelCounterVendorPayment(
    ctx.db,
    { counterName: ctx.counterName, username: user?.username ?? ctx.counterName },
    vendorPaymentId
  )
}
