"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Printer } from "lucide-react"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
    calculateCashSales,
    calculatePaymentSummary,
    calculateClosingCash,
    calculateExpectedCashWithInOut,
} from "@/lib/types"
import { getAllEntries } from "@/app/actions/admin"

/* ================= HELPERS ================= */

const EMPTY_DENOMS: DenominationCount = {
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

const subtractDenoms = ( closing: DenominationCount, next?: DenominationCount ) =>
{
    const r = { ...EMPTY_DENOMS }
        ; ( Object.keys( r ) as ( keyof DenominationCount )[] ).forEach( k =>
        {
            r[ k ] = Math.max( 0, closing[ k ] - ( next?.[ k ] || 0 ) )
        } )
    return r
}

const StatusBadge = ( { status }: { status?: string } ) =>
{
    if ( !status ) return <span>—</span>

    const map: Record<string, string> = {
        open: "text-blue-600",
        submitted: "text-orange-600",
        confirmed: "text-green-600",
    }

    return (
        <span className={ `font-semibold ${ map[ status ] || "" }` }>
            { status.toUpperCase() }
        </span>
    )
}

/* ================= PAGE ================= */

export default function CounterComparisonPage ()
{
    const router = useRouter()

    const [ selectedDate, setSelectedDate ] = useState(
        new Date().toISOString().split( "T" )[ 0 ]
    )
    const [ entries, setEntries ] = useState<DayEntry[]>( [] )

    useEffect( () =>
    {
        getAllEntries( selectedDate ).then( setEntries )
    }, [ selectedDate ] )

    const uniqueEntries = useMemo( () =>
    {
        const map = new Map<string, DayEntry>()

        for ( const e of entries )
        {
            const key = `${ e.counterName }_${ e.date }`
            const rank = ( x: DayEntry ) =>
                x.status === "confirmed" ? 3 : x.status === "submitted" ? 2 : 1

            if ( !map.has( key ) || rank( e ) > rank( map.get( key )! ) )
            {
                map.set( key, e )
            }
        }

        return Array.from( map.values() )
    }, [ entries ] )

    /* ================= GRAND TOTAL ================= */

    const totals = useMemo( () =>
    {
        return uniqueEntries.reduce(
            ( acc, entry ) =>
            {
                const isBoth = entry.counterName === "Smart Fashion (Both)"

                const cashSales = calculateCashSales( entry.sales, isBoth )
                const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

                const card = isBoth
                    ? ( entry.sales.martCardUpi || 0 ) + ( entry.sales.fashionCardUpi || 0 )
                    : entry.sales.cardUpiSales || 0

                const credit = isBoth
                    ? ( entry.sales.martCredit || 0 ) + ( entry.sales.fashionCredit || 0 )
                    : entry.sales.creditSales || 0

                const expected = calculateExpectedCashWithInOut(
                    entry.openingCash || 0,
                    cashSales,
                    entry.payments
                )

                const actual = calculateClosingCash( entry.closingDenominations )
                const diff = expected - actual

                const nextDay = calculateClosingCash(
                    entry.nextDayOpeningDenominations || EMPTY_DENOMS
                )

                const available = calculateClosingCash(
                    subtractDenoms(
                        entry.closingDenominations,
                        entry.nextDayOpeningDenominations
                    )
                )

                acc.opening += entry.openingCash || 0
                acc.totalSales += cashSales + card + credit
                acc.cash += cashSales
                acc.card += card
                acc.credit += credit
                acc.in += totalIn
                acc.out += totalOut
                acc.expected += expected
                acc.actual += actual
                acc.diff += diff
                acc.nextDay += nextDay
                acc.available += available

                return acc
            },
            {
                opening: 0,
                totalSales: 0,
                cash: 0,
                card: 0,
                credit: 0,
                in: 0,
                out: 0,
                expected: 0,
                actual: 0,
                diff: 0,
                nextDay: 0,
                available: 0,
            }
        )
    }, [ uniqueEntries ] )

    return (
        <div className="w-full min-h-screen bg-muted/40 p-6 print:p-0">
            <Card className="w-full p-6 print:p-0 print:shadow-none print:border-none">
                {/* HEADER */ }
                <div className="flex justify-between mb-6 print:hidden">
                    <h2 className="text-2xl font-bold">Counter Comparison</h2>
                    <div className="flex gap-3">
                        <Input
                            type="date"
                            value={ selectedDate }
                            onChange={ e => setSelectedDate( e.target.value ) }
                            className="w-44"
                        />
                        <Button variant="outline" onClick={ () => router.push( "/admin" ) }>
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                    </div>
                </div>

                {/* TABLE */ }
                <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full text-xs print:text-[10px] border-collapse">
                        <thead className="border-b font-semibold">
                            <tr>
                                <th className="text-left p-1">Counter</th>
                                <th className="text-right p-1">Opening</th>
                                <th className="text-right p-1">Total</th>
                                <th className="text-right p-1">Cash</th>
                                <th className="text-right p-1">Card</th>
                                <th className="text-right p-1">Credit</th>
                                <th className="text-right p-1">IN</th>
                                <th className="text-right p-1">OUT</th>
                                <th className="text-right p-1">Expected</th>
                                <th className="text-right p-1">Actual</th>
                                <th className="text-right p-1">Short / Excess</th>
                                <th className="text-right p-1">Next Day</th>
                                <th className="text-right p-1">Available</th>
                            </tr>
                        </thead>

                        <tbody>
                            { uniqueEntries.map( entry =>
                            {
                                const isBoth = entry.counterName === "Smart Fashion (Both)"

                                const cashSales = calculateCashSales( entry.sales, isBoth )
                                const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

                                const card = isBoth
                                    ? ( entry.sales.martCardUpi || 0 ) +
                                    ( entry.sales.fashionCardUpi || 0 )
                                    : entry.sales.cardUpiSales || 0

                                const credit = isBoth
                                    ? ( entry.sales.martCredit || 0 ) +
                                    ( entry.sales.fashionCredit || 0 )
                                    : entry.sales.creditSales || 0

                                const expected = calculateExpectedCashWithInOut(
                                    entry.openingCash || 0,
                                    cashSales,
                                    entry.payments
                                )

                                const actual = calculateClosingCash( entry.closingDenominations )
                                const diff = expected - actual

                                const nextDay = calculateClosingCash(
                                    entry.nextDayOpeningDenominations || EMPTY_DENOMS
                                )

                                const available = calculateClosingCash(
                                    subtractDenoms(
                                        entry.closingDenominations,
                                        entry.nextDayOpeningDenominations
                                    )
                                )

                                /* ===== SMART FASHION SPLIT ===== */
                                if ( isBoth )
                                {
                                    const martCash =
                                        ( entry.sales.martTotalSales || 0 ) -
                                        ( entry.sales.martCardUpi || 0 ) -
                                        ( entry.sales.martCredit || 0 )

                                    const fashionCash =
                                        ( entry.sales.fashionTotalSales || 0 ) -
                                        ( entry.sales.fashionCardUpi || 0 ) -
                                        ( entry.sales.fashionCredit || 0 )

                                    return (
                                        <React.Fragment key={ entry._id }>
                                            <tr className="font-bold border-t">
                                                <td colSpan={ 13 } className="p-2">
                                                    Smart Fashion (Both)
                                                </td>
                                            </tr>

                                            <tr>
                                                <td className="p-1">├─ Smart Mart</td>
                                                <td>—</td>
                                                <td className="text-right p-1">{ entry.sales.martTotalSales?.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ martCash.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ entry.sales.martCardUpi?.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ entry.sales.martCredit?.toFixed( 2 ) }</td>
                                                <td colSpan={ 7 } className="text-center">—</td>
                                            </tr>

                                            <tr>
                                                <td className="p-1">├─ Smart Fashion</td>
                                                <td>—</td>
                                                <td className="text-right p-1">{ entry.sales.fashionTotalSales?.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ fashionCash.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ entry.sales.fashionCardUpi?.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ entry.sales.fashionCredit?.toFixed( 2 ) }</td>
                                                <td colSpan={ 7 } className="text-center">—</td>
                                            </tr>

                                            <tr className="font-semibold border-b">
                                                <td className="p-1">
                                                    ├─ TOTAL
                                                    <div className="text-[9px]">
                                                        <StatusBadge status={ entry.status } />
                                                    </div>
                                                </td>
                                                <td className="text-right p-1">{ entry.openingCash?.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ ( cashSales + card + credit ).toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ cashSales.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ card.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ credit.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ totalIn.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ totalOut.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ expected.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ actual.toFixed( 2 ) }</td>
                                                <td
                                                    className={ `text-right p-1 font-semibold ${ diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""
                                                        }` }
                                                >
                                                    { Math.abs( diff ).toFixed( 2 ) }
                                                </td>
                                                <td className="text-right p-1">{ nextDay.toFixed( 2 ) }</td>
                                                <td className="text-right p-1">{ available.toFixed( 2 ) }</td>
                                            </tr>
                                        </React.Fragment>
                                    )
                                }

                                /* ===== NORMAL COUNTER ===== */
                                return (
                                    <tr key={ entry._id } className="border-b">
                                        <td className="p-1 font-semibold">
                                            { entry.counterName }
                                            <div className="text-[9px]">
                                                <StatusBadge status={ entry.status } />
                                            </div>
                                        </td>
                                        <td className="text-right p-1">{ entry.openingCash?.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ ( cashSales + card + credit ).toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ cashSales.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ card.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ credit.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ totalIn.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ totalOut.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ expected.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ actual.toFixed( 2 ) }</td>
                                        <td
                                            className={ `text-right p-1 font-semibold ${ diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""
                                                }` }
                                        >
                                            { Math.abs( diff ).toFixed( 2 ) }
                                        </td>
                                        <td className="text-right p-1">{ nextDay.toFixed( 2 ) }</td>
                                        <td className="text-right p-1">{ available.toFixed( 2 ) }</td>
                                    </tr>
                                )
                            } ) }

                            {/* ===== GRAND TOTAL ===== */ }
                            <tr className="font-bold bg-muted/30 border-t-2">
                                <td className="p-1">GRAND TOTAL</td>
                                <td className="text-right p-1">{ totals.opening.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.totalSales.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.cash.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.card.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.credit.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.in.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.out.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.expected.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.actual.toFixed( 2 ) }</td>
                                <td
                                    className={ `text-right p-1 font-semibold ${ totals.diff > 0 ? "text-red-600" : totals.diff < 0 ? "text-green-600" : ""
                                        }` }
                                >
                                    { Math.abs( totals.diff ).toFixed( 2 ) }
                                </td>
                                <td className="text-right p-1">{ totals.nextDay.toFixed( 2 ) }</td>
                                <td className="text-right p-1">{ totals.available.toFixed( 2 ) }</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* PRINT BUTTON */ }
                <div className="mt-6 flex justify-end print:hidden">
                    <Button onClick={ () => window.print() }>
                        <Printer className="w-4 h-4 mr-2" />
                        Print (A4 Landscape)
                    </Button>
                </div>
            </Card>
        </div>
    )
}
