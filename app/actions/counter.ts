"use server"

import { getDatabase } from "@/lib/mongodb"
import { getSession } from "@/lib/session"
import type {
    DayEntry,
    Payment,
    SalesData,
    DenominationCount,
} from "@/lib/types"
import { calculateCashSales } from "@/lib/types"
import { redirect } from "next/navigation"

/* =====================================================
   DATE HELPER (IST SAFE)
   ===================================================== */

function getTodayIST (): string
{
    return new Date().toLocaleDateString( "en-CA", {
        timeZone: "Asia/Kolkata",
    } )
}

/* =====================================================
   UTILS
   ===================================================== */

function serializeEntry ( entry: any ): DayEntry
{
    return {
        ...entry,
        _id: entry._id?.toString(),

        date:
            typeof entry.date === "string"
                ? entry.date
                : entry.date?.toISOString?.(),

        createdAt:
            entry.createdAt instanceof Date
                ? entry.createdAt.toISOString()
                : entry.createdAt,

        updatedAt:
            entry.updatedAt instanceof Date
                ? entry.updatedAt.toISOString()
                : entry.updatedAt,

        submittedAt:
            entry.submittedAt instanceof Date
                ? entry.submittedAt.toISOString()
                : entry.submittedAt,

        confirmedAt:
            entry.confirmedAt instanceof Date
                ? entry.confirmedAt.toISOString()
                : entry.confirmedAt,

        openingVerifiedAt:
            entry.openingVerifiedAt instanceof Date
                ? entry.openingVerifiedAt.toISOString()
                : entry.openingVerifiedAt,

        payments:
            entry.payments?.map( ( p: any ) => ( {
                ...p,
                time: p.time instanceof Date ? p.time.toISOString() : p.time,
                type: p.type || "OUT",
            } ) ) || [],
    }
}

function emptyDenominations (): DenominationCount
{
    return {
        notes500: 0,
        notes200: 0,
        notes100: 0,
        notes50: 0,
        notes20: 0,
        notes10: 0,
        coins10: 0,
        coins5: 0,
        coins2: 0,
        coins1: 0,
    }
}

function cloneDenoms ( d: DenominationCount ): DenominationCount
{
    return { ...d }
}

function calculateDenominationTotal ( d: DenominationCount ): number
{
    return (
        ( d.notes500 || 0 ) * 500 +
        ( d.notes200 || 0 ) * 200 +
        ( d.notes100 || 0 ) * 100 +
        ( d.notes50 || 0 ) * 50 +
        ( d.notes20 || 0 ) * 20 +
        ( d.notes10 || 0 ) * 10 +
        ( d.coins10 || 0 ) * 10 +
        ( d.coins5 || 0 ) * 5 +
        ( d.coins2 || 0 ) * 2 +
        ( d.coins1 || 0 )
    )
}

/* =====================================================
   ENTRY FETCH (OPENING CASH SOURCE OF TRUTH)
   ===================================================== */

export async function getTodayEntry (): Promise<DayEntry | null>
{
    const user = await getSession()
    if ( !user || user.role !== "counter" ) redirect( "/" )

    const db = await getDatabase()
    const today = getTodayIST()

    let entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: today,
    } )

    if ( !entry )
    {
        const yesterday = new Date()
        yesterday.setDate( yesterday.getDate() - 1 )
        const yStr = yesterday.toLocaleDateString( "en-CA", {
            timeZone: "Asia/Kolkata",
        } )

        const prev = await db.collection<DayEntry>( "entries" ).findOne( {
            counterName: user.counterName!,
            date: yStr,
            status: { $in: [ "submitted", "confirmed" ] },
        } )

        const openingDenominations = prev?.nextDayOpeningDenominations
            ? cloneDenoms( prev.nextDayOpeningDenominations )
            : emptyDenominations()

        const openingCash =
            prev?.nextDayOpeningCash ??
            calculateDenominationTotal( openingDenominations )

        const newEntry: Omit<DayEntry, "_id"> = {
            counterName: user.counterName!,
            date: today,

            openingCash,
            openingCoins: 0,
            openingDenominations,

            openingVerified: false,
            openingVerifiedAt: null,

            payments: [],
            sales: {
                totalSales: 0,
                cardUpiSales: 0,
                creditSales: 0,
            },

            closingDenominations: emptyDenominations(),

            status: "open",

            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        const res = await db.collection( "entries" ).insertOne( newEntry as any )
        entry = { ...newEntry, _id: res.insertedId.toString() } as DayEntry
    }

    return serializeEntry( entry )
}

/* =====================================================
   GET ENTRY BY DATE
   ===================================================== */

export async function getEntryByDate ( date: string ): Promise<DayEntry | null>
{
    const user = await getSession()
    if ( !user || user.role !== "counter" ) redirect( "/" )

    const db = await getDatabase()

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date,
    } )

    return entry ? serializeEntry( entry ) : null
}

/* =====================================================
   OPENING VERIFY
   ===================================================== */

export async function verifyOpeningCash ( date?: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                openingVerified: true,
                openingVerifiedAt: new Date(),
                updatedAt: new Date(),
            },
        }
    )

    return { success: true }
}

/* =====================================================
   PAYMENTS
   ===================================================== */

export async function addPayment (
    description: string,
    amount: number,
    type: "IN" | "OUT",
    date?: string
)
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    const payment: Payment = {
        time: new Date().toISOString(),
        description,
        amount,
        type,
    }

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate, status: "open" },
        { $push: { payments: payment as any }, $set: { updatedAt: new Date() } }
    )

    return { success: true }
}

export async function updatePayment (
    index: number,
    description: string,
    amount: number,
    type: "IN" | "OUT",
    date?: string
)
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: targetDate,
        status: "open",
    } )

    if ( !entry || !entry.payments?.[ index ] )
        return { error: "Payment not found" }

    entry.payments[ index ] = {
        ...entry.payments[ index ],
        description,
        amount,
        type,
    }

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        { $set: { payments: entry.payments, updatedAt: new Date() } }
    )

    return { success: true }
}

export async function deletePayment ( index: number, date?: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: targetDate,
        status: "open",
    } )

    if ( !entry || !entry.payments?.[ index ] )
        return { error: "Payment not found" }

    entry.payments.splice( index, 1 )

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                payments: entry.payments,
                updatedAt: new Date(),
            },
        }
    )

    return { success: true }
}

/* =====================================================
   SALES
   ===================================================== */

export async function updateSales ( sales: SalesData, date?: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate, status: "open" },
        { $set: { sales: { ...sales }, updatedAt: new Date() } }
    )

    return { success: true }
}

/* =====================================================
   CLOSING CASH
   ===================================================== */

export async function updateClosingCash (
    denominations: DenominationCount,
    date?: string
)
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate, status: "open" },
        {
            $set: {
                closingDenominations: cloneDenoms( denominations ),
                updatedAt: new Date(),
            },
        }
    )

    return { success: true }
}

/* =====================================================
   SUBMIT DAY
   ===================================================== */

export async function submitDay ( date?: string, closedBy?: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: targetDate,
        status: "open",
    } )

    if ( !entry ) return { error: "Entry not found" }

    const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
    const cashSales = calculateCashSales( entry.sales, isFashionBoth )

    let totalIn = 0
    let totalOut = 0

    for ( const p of entry.payments || [] )
    {
        if ( ( p.type || "OUT" ) === "IN" ) totalIn += p.amount
        else totalOut += p.amount
    }

    const expectedCash =
        entry.openingCash + cashSales + totalIn - totalOut

    const actualCash = calculateDenominationTotal( entry.closingDenominations )
    const shortage = expectedCash - actualCash

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                status: "submitted",
                submittedExpectedCash: expectedCash,
                submittedActualCash: actualCash,
                submittedShortage: shortage,
                closedBy: closedBy?.trim() || null,
                submittedAt: new Date(),
                updatedAt: new Date(),
            },
        }
    )

    return { success: true }
}

/* =====================================================
   NEXT DAY OPENING
   ===================================================== */

export async function setNextDayOpening (
    amount: number,
    denominations: DenominationCount,
    date?: string
)
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()
    const targetDate = date || getTodayIST()

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                nextDayOpeningCash: amount,
                nextDayOpeningDenominations: cloneDenoms( denominations ),
                updatedAt: new Date(),
            },
        }
    )

    return { success: true }
}

/* =====================================================
   OPENING CASH FOR ANY DATE (ADMIN OVERRIDE NON-ZERO)
   ===================================================== */

export async function getOpeningCashForDate ( date: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()

    /* 1️⃣ ADMIN OVERRIDE (ONLY IF NON-ZERO & EXPLICIT) */
    const todayEntry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date,
    } )

    if (
        todayEntry &&
        typeof todayEntry.openingCash === "number" &&
        todayEntry.openingCash > 0
    )
    {
        return {
            date,
            cash: todayEntry.openingCash,
        }
    }

    /* 2️⃣ ORIGINAL WORKING LOGIC (UNCHANGED) */
    const d = new Date( date )
    d.setDate( d.getDate() - 1 )

    const prevDate = d.toLocaleDateString( "en-CA", {
        timeZone: "Asia/Kolkata",
    } )

    const prev = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: prevDate,
        status: { $in: [ "submitted", "confirmed" ] },
    } )

    return {
        date: prevDate,
        cash:
            prev?.nextDayOpeningCash ??
            ( prev?.nextDayOpeningDenominations
                ? calculateDenominationTotal( prev.nextDayOpeningDenominations )
                : 0 ),
    }
}

/* =====================================================
   YESTERDAY OPENING SOURCE (READ ONLY)
   ===================================================== */

export async function getYesterdayOpeningSource ()
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
        return { error: "Unauthorized" }

    const db = await getDatabase()

    const yesterday = new Date()
    yesterday.setDate( yesterday.getDate() - 1 )

    const yStr = yesterday.toLocaleDateString( "en-CA", {
        timeZone: "Asia/Kolkata",
    } )

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: yStr,
    } )

    return {
        date: yStr,
        denominations: entry?.nextDayOpeningDenominations
            ? { ...entry.nextDayOpeningDenominations }
            : null,
        cash:
            entry?.nextDayOpeningCash ??
            ( entry?.nextDayOpeningDenominations
                ? calculateDenominationTotal( entry.nextDayOpeningDenominations )
                : null ),
    }
}
