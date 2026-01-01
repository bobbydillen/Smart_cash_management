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
   UTILITIES
   ===================================================== */

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
        d.notes500 * 500 +
        d.notes200 * 200 +
        d.notes100 * 100 +
        d.notes50 * 50 +
        d.notes20 * 20 +
        d.notes10 * 10 +
        d.coins10 * 10 +
        d.coins5 * 5 +
        d.coins2 * 2 +
        d.coins1
    )
}

function serializeEntry ( entry: any ): DayEntry
{
    return {
        ...entry,
        _id: entry._id?.toString(),
        payments:
            entry.payments?.map( ( p: any ) => ( {
                ...p,
                time: p.time instanceof Date ? p.time.toISOString() : p.time,
                type: p.type || "OUT",
            } ) ) || [],
    }
}

/* =====================================================
   GET TODAY ENTRY (COUNTER ONLY)
   ===================================================== */

export async function getTodayEntry (): Promise<DayEntry | null>
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
    {
        redirect( "/" )
    }

    const db = await getDatabase()
    const today = getTodayIST()

    let entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: today,
    } )

    if ( !entry )
    {
        const d = new Date()
        d.setDate( d.getDate() - 1 )

        const prevDate = d.toLocaleDateString( "en-CA", {
            timeZone: "Asia/Kolkata",
        } )

        const prev = await db.collection<DayEntry>( "entries" ).findOne( {
            counterName: user.counterName!,
            date: prevDate,
            status: { $in: [ "submitted", "confirmed" ] },
        } )

        let openingCash = 0
        let openingDenominations = emptyDenominations()

        if ( prev )
        {
            if ( typeof prev.nextDayOpeningCash === "number" )
            {
                openingCash = prev.nextDayOpeningCash
            }
            else if ( prev.nextDayOpeningDenominations )
            {
                openingDenominations = cloneDenoms( prev.nextDayOpeningDenominations )
                openingCash = calculateDenominationTotal( openingDenominations )
            }
        }

        const newEntry: Omit<DayEntry, "_id"> = {
            counterName: user.counterName!,
            date: today,
            openingCash,
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
   GET ENTRY BY DATE (COUNTER ONLY)
   ===================================================== */

export async function getEntryByDate ( date: string )
{
    const user = await getSession()
    if ( !user || user.role !== "counter" )
    {
        redirect( "/" )
    }

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

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: date || getTodayIST() },
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

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: date || getTodayIST(), status: "open" },
        {
            $push: {
                payments: {
                    description,
                    amount,
                    type,
                    time: new Date().toISOString(),
                },
            },
            $set: { updatedAt: new Date() },
        }
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
        { $set: { payments: entry.payments, updatedAt: new Date() } }
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

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: date || getTodayIST(), status: "open" },
        { $set: { sales, updatedAt: new Date() } }
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

    // 🔑 calculate total from denominations
    const closingTotal = calculateDenominationTotal( denominations )

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                closingDenominations: cloneDenoms( denominations ),

                // ✅ KEEP NEXT DAY OPENING IN SYNC
                nextDayOpeningCash: closingTotal,
                nextDayOpeningDenominations: cloneDenoms( denominations ),

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

    for ( const p of entry.payments )
    {
        if ( p.type === "IN" ) totalIn += p.amount
        else totalOut += p.amount
    }

    const expectedCash =
        entry.openingCash + cashSales + totalIn - totalOut

    const actualCash = calculateDenominationTotal( entry.closingDenominations )

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: targetDate },
        {
            $set: {
                status: "submitted",
                submittedExpectedCash: expectedCash,
                submittedActualCash: actualCash,
                submittedShortage: expectedCash - actualCash,
                closedBy: closedBy || null,
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

    await db.collection( "entries" ).updateOne(
        { counterName: user.counterName!, date: date || getTodayIST() },
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
   YESTERDAY OPENING SOURCE (OPENING VERIFY PAGE)
   ===================================================== */

export async function getYesterdayOpeningSource ()
{
    const user = await getSession()
    if ( user.role !== "counter" && user.role !== "admin" )
    {
        return { error: "Unauthorized" }
    }



    const db = await getDatabase()

    const d = new Date()
    d.setDate( d.getDate() - 1 )

    const yStr = d.toLocaleDateString( "en-CA", {
        timeZone: "Asia/Kolkata",
    } )

    const entry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date: yStr,
        status: { $in: [ "submitted", "confirmed" ] },
    } )

    if ( !entry )
    {
        return {
            date: yStr,
            cash: 0,
            denominations: emptyDenominations(),
        }
    }

    return {
        date: yStr,
        cash:
            entry.nextDayOpeningCash ??
            calculateDenominationTotal( entry.nextDayOpeningDenominations ),
        denominations: cloneDenoms( entry.nextDayOpeningDenominations ),
    }
}
/* =====================================================
   OPENING CASH FOR ANY DATE (READ-ONLY)
   Used by Closing Page
   ===================================================== */
export async function getOpeningCashForDate ( date: string )
{
    const user = await getSession()
    if ( !user ) return { error: "Unauthorized" }

    // allow both counter & admin to read
    if ( user.role !== "counter" && user.role !== "admin" )
    {
        return { error: "Unauthorized" }
    }

    const db = await getDatabase()

    /* =====================================================
       1️⃣ TODAY ENTRY (ONLY IF VERIFIED / OVERRIDDEN)
       ===================================================== */

    const todayEntry = await db.collection<DayEntry>( "entries" ).findOne( {
        counterName: user.counterName!,
        date,
    } )

    // ✅ USE TODAY ONLY IF IT WAS VERIFIED (counter/admin)
    if (
        todayEntry &&
        todayEntry.openingVerified === true &&
        typeof todayEntry.openingCash === "number"
    )
    {
        return { date, cash: todayEntry.openingCash }
    }

    /* =====================================================
       2️⃣ FALLBACK → YESTERDAY CARRY-FORWARD
       ===================================================== */

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
                ? (
                    ( prev.nextDayOpeningDenominations.notes500 || 0 ) * 500 +
                    ( prev.nextDayOpeningDenominations.notes200 || 0 ) * 200 +
                    ( prev.nextDayOpeningDenominations.notes100 || 0 ) * 100 +
                    ( prev.nextDayOpeningDenominations.notes50 || 0 ) * 50 +
                    ( prev.nextDayOpeningDenominations.notes20 || 0 ) * 20 +
                    ( prev.nextDayOpeningDenominations.notes10 || 0 ) * 10 +
                    ( prev.nextDayOpeningDenominations.coins10 || 0 ) * 10 +
                    ( prev.nextDayOpeningDenominations.coins5 || 0 ) * 5 +
                    ( prev.nextDayOpeningDenominations.coins2 || 0 ) * 2 +
                    ( prev.nextDayOpeningDenominations.coins1 || 0 )
                )
                : 0 ),
    }
}
