"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateClosingCash,
  calculateCashSales,
  calculateExpectedCash,
  calculateTotalPayments,
} from "@/lib/types"
import
{
  updateClosingCash,
  setNextDayOpening,
  submitDay,
} from "@/app/actions/counter"
import { Printer } from "lucide-react"

/* ================= CONSTANTS ================= */

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

const NOTES = [
  [ "₹500", "notes500", 500 ],
  [ "₹200", "notes200", 200 ],
  [ "₹100", "notes100", 100 ],
  [ "₹50", "notes50", 50 ],
  [ "₹20", "notes20", 20 ],
  [ "₹10", "notes10", 10 ],
] as const

const COINS = [
  [ "₹10", "coins10", 10 ],
  [ "₹5", "coins5", 5 ],
  [ "₹2", "coins2", 2 ],
  [ "₹1", "coins1", 1 ],
] as const

interface ClosingPageProps
{
  entry: DayEntry
  user: { username: string; counterName?: string }
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
}

export default function ClosingPage ( {
  entry,
  user,
  refreshEntry,
  isReadOnly,
}: ClosingPageProps )
{
  /* ---------- STATE ---------- */
  const [ closing, setClosing ] = useState<DenominationCount>( () => entry.closingDenominations )
  const [ nextDay, setNextDay ] = useState<DenominationCount>(
    () => entry.nextDayOpeningDenominations || EMPTY_DENOMS
  )
  const [ isSubmitting, setIsSubmitting ] = useState( false )

  const printRef = useRef<HTMLDivElement>( null )
  const saveTimer = useRef<NodeJS.Timeout>()
  const nextDayTimer = useRef<NodeJS.Timeout>()

  /* ---------- HELPERS ---------- */
  const safeQty = ( v: string ) => Math.max( 0, Number( v ) || 0 )
  const safeNextQty = ( k: keyof DenominationCount, v: string ) =>
    Math.min( safeQty( v ), closing[ k ] )

  /* ---------- AUTOSAVE ---------- */
  useEffect( () =>
  {
    if ( isReadOnly ) return
    clearTimeout( saveTimer.current )
    saveTimer.current = setTimeout( () =>
    {
      updateClosingCash( closing, entry.date )
    }, 800 )
  }, [ closing, isReadOnly, entry.date ] )

  useEffect( () =>
  {
    if ( isReadOnly ) return
    clearTimeout( nextDayTimer.current )
    const total = calculateClosingCash( nextDay )
    nextDayTimer.current = setTimeout( () =>
    {
      setNextDayOpening( total, nextDay, entry.date )
    }, 800 )
  }, [ nextDay, isReadOnly, entry.date ] )

  /* ---------- CALCULATIONS ---------- */
  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const totalPayments = calculateTotalPayments( entry.payments )
  const cashSales = calculateCashSales( entry.sales, isFashionBoth )

  const expectedCash = calculateExpectedCash(
    entry.openingCash,
    cashSales,
    totalPayments
  )

  const actualCash = calculateClosingCash( closing )
  const shortage = expectedCash - actualCash

  const nextDayTotal = calculateClosingCash( nextDay )
  const availableCash = actualCash - nextDayTotal

  /* ---------- ACTIONS ---------- */
  const handleSubmit = async () =>
  {
    setIsSubmitting( true )
    await updateClosingCash( closing, entry.date )
    await setNextDayOpening( nextDayTotal, nextDay, entry.date )
    await submitDay( entry.date )
    await refreshEntry()
    setIsSubmitting( false )
  }

  const handlePrint = () =>
  {
    if ( !printRef.current ) return
    const w = window.open( "", "", "width=380,height=600" )
    if ( !w ) return
    w.document.write( `
      <html>
        <head>
          <style>
            body { font-family: monospace; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 4px; }
            .right { text-align: right; }
            .total { border-top: 1px solid #000; font-weight: bold; }
            .highlight {
              font-weight: 900;
              font-size: 15px;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          ${ printRef.current.innerHTML }
        </body>
      </html>
    `)
    w.document.close()
    w.print()
  }

  /* ---------- RENDER HELPERS ---------- */
  const renderRows = (
    rows: readonly ( readonly [ string, keyof DenominationCount, number ] )[],
    state: DenominationCount,
    setter: React.Dispatch<React.SetStateAction<DenominationCount>>,
    limit?: boolean
  ) =>
    rows.map( ( [ label, key, value ] ) => (
      <tr key={ key }>
        <td>{ label }</td>
        <td className="text-center">
          <Input
            type="number"
            min={ 0 }
            className="w-16 text-center mx-auto"
            value={ state[ key ] }
            disabled={ isReadOnly }
            onChange={ ( e ) =>
              setter( ( p ) => ( {
                ...p,
                [ key ]: limit
                  ? safeNextQty( key, e.target.value )
                  : safeQty( e.target.value ),
              } ) )
            }
          />
        </td>
        <td className="right">₹{ ( state[ key ] * value ).toFixed( 2 ) }</td>
      </tr>
    ) )

  /* ================= JSX ================= */
  return (
    <div className="space-y-6">

      {/* Closing Cash */ }
      <Card className="p-4">
        <h3 className="font-bold mb-2">Closing Cash Count</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td colSpan={ 3 } className="font-semibold">Cash (Notes)</td></tr>
            { renderRows( NOTES, closing, setClosing ) }
            <tr><td colSpan={ 3 } className="font-semibold pt-2">Coins</td></tr>
            { renderRows( COINS, closing, setClosing ) }
          </tbody>
        </table>
      </Card>

      {/* Summary */ }
      <Card className="p-4">
        <div className="flex justify-between"><span>Expected Cash</span><span>₹{ expectedCash.toFixed( 2 ) }</span></div>
        <div className="flex justify-between"><span>Actual Cash</span><span>₹{ actualCash.toFixed( 2 ) }</span></div>
        <div className="flex justify-between font-bold">
          <span>{ shortage > 0 ? "Shortage" : "Excess" }</span>
          <span>₹{ Math.abs( shortage ).toFixed( 2 ) }</span>
        </div>
      </Card>

      {/* Next Day Opening */ }
      <Card className="p-4">
        <h3 className="font-bold mb-2">Next Day Opening Cash</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td colSpan={ 3 } className="font-semibold">Cash (Notes)</td></tr>
            { renderRows( NOTES, nextDay, setNextDay, true ) }
            <tr><td colSpan={ 3 } className="font-semibold pt-2">Coins</td></tr>
            { renderRows( COINS, nextDay, setNextDay, true ) }
          </tbody>
        </table>
      </Card>

      {/* Print Preview */ }
      <Card className="p-4" ref={ printRef }>
        <h3 className="text-center font-bold">Smart Mart & Smart Fashions</h3>
        <p className="text-center text-sm">{ user.counterName }</p>
        <p className="text-center text-xs mb-2">{ new Date( entry.date ).toLocaleDateString( "en-IN" ) }</p>

        <table className="text-sm w-full">
          <tbody>
            <tr><td>Opening Cash</td><td className="right">₹{ entry.openingCash.toFixed( 2 ) }</td></tr>
            <tr><td>Cash Sales</td><td className="right">₹{ cashSales.toFixed( 2 ) }</td></tr>
            <tr><td>Payments</td><td className="right">-₹{ totalPayments.toFixed( 2 ) }</td></tr>
            <tr className="total"><td>Expected Cash</td><td className="right">₹{ expectedCash.toFixed( 2 ) }</td></tr>
            <tr className="total"><td>Actual Cash</td><td className="right">₹{ actualCash.toFixed( 2 ) }</td></tr>
            <tr className="total highlight">
              <td>{ shortage > 0 ? "SHORTAGE" : "EXCESS" }</td>
              <td className="right">₹{ Math.abs( shortage ).toFixed( 2 ) }</td>
            </tr>
            <tr className="total"><td>Next Day Opening</td><td className="right">₹{ nextDayTotal.toFixed( 2 ) }</td></tr>
            <tr className="total"><td>Available Cash</td><td className="right">₹{ availableCash.toFixed( 2 ) }</td></tr>
          </tbody>
        </table>
      </Card>

      <Button onClick={ handlePrint } variant="outline" className="w-full">
        <Printer className="w-4 h-4 mr-2" /> Print Cash Summary
      </Button>

      { !isReadOnly && (
        <Button onClick={ handleSubmit } disabled={ isSubmitting } className="w-full">
          { isSubmitting ? "Submitting..." : "Submit Day" }
        </Button>
      ) }
    </div>
  )
}
