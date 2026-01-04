"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayEntry, DenominationCount } from "@/lib/types"
import
{
  calculateClosingCash,
  calculateCashSales,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import
{
  updateClosingCash,
  setNextDayOpening,
  submitDay,
  getOpeningCashForDate,
} from "@/app/actions/counter"
import { Printer, Save } from "lucide-react"

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

const DENOMS = [
  [ "₹500", "notes500", 500 ],
  [ "₹200", "notes200", 200 ],
  [ "₹100", "notes100", 100 ],
  [ "₹50", "notes50", 50 ],
  [ "₹20", "notes20", 20 ],
  [ "₹10", "notes10", 10 ],
  [ "₹10", "coins10", 10 ],
  [ "₹5", "coins5", 5 ],
  [ "₹2", "coins2", 2 ],
  [ "₹1", "coins1", 1 ],
] as const

/* ================= HELPERS ================= */
// 👇 ADD HERE
const CASH_KEYS = [
  "notes500",
  "notes200",
  "notes100",
  "notes50",
  "notes20",
  "notes10",
] as const

const COIN_KEYS = [
  "coins10",
  "coins5",
  "coins2",
  "coins1",
] as const

const cloneDenoms = ( d: DenominationCount ): DenominationCount => ( { ...d } )

const subtractDenoms = (
  closing: DenominationCount,
  nextDay: DenominationCount
): DenominationCount =>
{
  const r = { ...EMPTY_DENOMS }
    ; ( Object.keys( r ) as ( keyof DenominationCount )[] ).forEach( ( k ) =>
    {
      r[ k ] = Math.max( 0, closing[ k ] - ( nextDay[ k ] || 0 ) )
    } )
  return r
}

const FixedInput = ( props: any ) => (
  <Input
    { ...props }
    className="w-20 text-center tabular-nums"
    onWheel={ e => ( e.target as HTMLInputElement ).blur() }
  />
)

/* ================= COMPONENT ================= */

export default function ClosingPage ( {
  entry,
  user,
  refreshEntry,
  isReadOnly,
}: {
  entry: DayEntry
  user: { username: string; counterName?: string }
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
} )
{
  /* ================= STATE ================= */

  const [ closing, setClosing ] = useState(
    cloneDenoms( entry.closingDenominations )
  )

  const [ nextDay, setNextDay ] = useState(
    entry.nextDayOpeningDenominations
      ? cloneDenoms( entry.nextDayOpeningDenominations )
      : cloneDenoms( EMPTY_DENOMS )
  )

  const [ closedBy, setClosedBy ] = useState( entry.closedBy || "" )
  const [ openingCash, setOpeningCash ] = useState( 0 )
  const [ hasUserEdited, setHasUserEdited ] = useState( false )
  const printRef = useRef<HTMLDivElement>( null )

  const [ savedNames, setSavedNames ] = useState<string[]>( [] )
  const closedByRef = useRef<HTMLInputElement>( null )



  /* ================= SYNC ENTRY ================= */

  useEffect( () =>
  {
    if ( hasUserEdited ) return   // 🔒 prevents reset

    setClosing( cloneDenoms( entry.closingDenominations ) )
    setNextDay(
      entry.nextDayOpeningDenominations
        ? cloneDenoms( entry.nextDayOpeningDenominations )
        : cloneDenoms( EMPTY_DENOMS )
    )
    setClosedBy( entry.closedBy || "" )
  }, [ entry.date ] )


  useEffect( () =>
  {
    const key = `closedByNames_${ user.counterName || "default" }`
    const stored = localStorage.getItem( key )
    if ( stored )
    {
      setSavedNames( JSON.parse( stored ) )
    }
  }, [ user.counterName ] )




  /* ================= OPENING CASH (SOURCE OF TRUTH) ================= */

  useEffect( () =>
  {
    getOpeningCashForDate( entry.date ).then( res =>
    {
      if ( !res?.error )
      {
        setOpeningCash( res.cash )
      }
    } )
  }, [ entry.date ] )

  /* ================= CALCULATIONS ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"
  const cashSales = calculateCashSales( entry.sales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash( closing )
  const nextDayTotal = calculateClosingCash( nextDay )

  const availableDenoms = subtractDenoms( closing, nextDay )
  const availableCash = calculateClosingCash( availableDenoms )

  const shortage = expectedCash - actualCash

  /* ================= ACTIONS ================= */

  const saveClosing = async () =>
  {
    await updateClosingCash( cloneDenoms( closing ), entry.date )
    // ❌ DO NOT refresh here
  }

  const saveNextDay = async () =>
  {
    await setNextDayOpening(
      nextDayTotal,
      cloneDenoms( nextDay ),
      entry.date
    )
    // ❌ DO NOT refresh here
  }


  const handleSubmit = async () =>
  {
    // ❌ VALIDATION: Closed By is mandatory
    if ( !closedBy || !closedBy.trim() )
    {
      alert( "❌ Please enter Closed By name before submitting the day." )
      return
    }

    // 💾 SAVE STAFF NAME (optional but recommended)
    try
    {
      const key = `closedByNames_${ user.counterName || "default" }`
      const stored = localStorage.getItem( key )
      const names: string[] = stored ? JSON.parse( stored ) : []

      if ( !names.includes( closedBy.trim() ) )
      {
        names.push( closedBy.trim() )
        localStorage.setItem( key, JSON.stringify( names ) )
      }
    }
    catch ( err )
    {
      console.warn( "Closed By name not saved:", err )
    }

    // ✅ ORIGINAL FLOW (UNCHANGED)
    await saveClosing()
    await saveNextDay()
    await submitDay( entry.date, closedBy.trim() )
    await refreshEntry()
  }


  const handlePrint = () =>
  {
    if ( !printRef.current ) return

    const w = window.open( "", "_blank" )
    if ( !w ) return

    w.document.open()
    w.document.write( `
    <html>
      <head>
        <title>Print</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
            font-family: monospace;
            font-size: 12px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          td {
            padding: 2px 0;
          }

          .right { text-align: right; }
          .bold { font-weight: bold; }
          .big { font-size: 14px; font-weight: 800; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        ${ printRef.current.innerHTML }
      </body>
    </html>
  `)
    w.document.close()
  }

  /* ================= JSX ================= */

  return (
    <div className="space-y-4">



      {/* CLOSING CASH */ }
      <Card className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Closing Cash</h3>
          { !isReadOnly && (
            <Button size="sm" variant="outline" onClick={ saveClosing }>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
          ) }
        </div>

        <table className="w-full text-sm">
          <tbody>

            <tr className="font-bold bg-gray-100">
              <td colSpan={ 3 }>CASH NOTES</td>
            </tr>

            { DENOMS.filter( d => CASH_KEYS.includes( d[ 1 ] as any ) ).map( ( [ l, k, v ] ) => (
              <tr key={ k }>
                <td>{ l }</td>
                <td>
                  <FixedInput
                    type="number"
                    value={ closing[ k ] }
                    disabled={ isReadOnly }
                    onChange={ e =>
                    {
                      setHasUserEdited( true )
                      setClosing( { ...closing, [ k ]: Number( e.target.value ) || 0 } )
                    } }
                  />
                </td>
                <td className="text-right">
                  ₹{ ( closing[ k ] * v ).toFixed( 2 ) }
                </td>
              </tr>
            ) ) }

            <tr className="font-bold bg-gray-100">
              <td colSpan={ 3 }>COINS</td>
            </tr>

            { DENOMS.filter( d => COIN_KEYS.includes( d[ 1 ] as any ) ).map( ( [ l, k, v ] ) => (
              <tr key={ k }>
                <td>{ l }</td>
                <td>
                  <FixedInput
                    type="number"
                    value={ closing[ k ] }
                    disabled={ isReadOnly }
                    onChange={ e =>
                    {
                      setHasUserEdited( true )
                      setClosing( { ...closing, [ k ]: Number( e.target.value ) || 0 } )
                    } }
                  />
                </td>
                <td className="text-right">
                  ₹{ ( closing[ k ] * v ).toFixed( 2 ) }
                </td>
              </tr>
            ) ) }

            {/* TOTAL */ }
            <tr className="border-t font-bold">
              <td>Total Actual Cash</td>
              <td />
              <td className="text-right">₹{ actualCash.toFixed( 2 ) }</td>
            </tr>

          </tbody>

        </table>

        {/* CASH RECONCILIATION */ }
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Opening Cash</span>
            <span>₹{ openingCash.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>+ Cash Sales</span>
            <span>₹{ cashSales.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>+ Payments In</span>
            <span>₹{ totalIn.toFixed( 2 ) }</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>- Payments Out</span>
            <span>₹{ totalOut.toFixed( 2 ) }</span>
          </div>
          <div className="border-t pt-1 flex justify-between font-bold">
            <span>Expected Cash</span>
            <span>₹{ expectedCash.toFixed( 2 ) }</span>
          </div>
          <div
            className={ `flex justify-between font-bold ${ shortage > 0 ? "text-red-600" : "text-green-600"
              }` }
          >
            <span>{ shortage > 0 ? "SHORTAGE" : "EXCESS" }</span>
            <span>₹{ Math.abs( shortage ).toFixed( 2 ) }</span>
          </div>
        </div>
      </Card>

      {/* NEXT DAY OPENING */ }
      <Card className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Next Day Opening</h3>
          { !isReadOnly && (
            <Button size="sm" variant="outline" onClick={ saveNextDay }>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
          ) }
        </div>

        <table className="w-full text-sm">
          <tbody>

            <tr className="font-bold bg-gray-100">
              <td colSpan={ 3 }>CASH NOTES</td>
            </tr>

            { DENOMS.filter( d => CASH_KEYS.includes( d[ 1 ] as any ) ).map( ( [ l, k, v ] ) => (
              <tr key={ k }>
                <td>{ l }</td>
                <td>
                  <FixedInput
                    type="number"
                    value={ nextDay[ k ] }
                    disabled={ isReadOnly }
                    onChange={ e =>
                    {
                      setHasUserEdited( true )
                      setNextDay( {
                        ...nextDay,
                        [ k ]: Math.min(
                          Number( e.target.value ) || 0,
                          closing[ k ]
                        ),
                      } )
                    } }
                  />
                </td>
                <td className="text-right">
                  ₹{ ( nextDay[ k ] * v ).toFixed( 2 ) }
                </td>
              </tr>
            ) ) }

            <tr className="font-bold bg-gray-100">
              <td colSpan={ 3 }>COINS</td>
            </tr>

            { DENOMS.filter( d => COIN_KEYS.includes( d[ 1 ] as any ) ).map( ( [ l, k, v ] ) => (
              <tr key={ k }>
                <td>{ l }</td>
                <td>
                  <FixedInput
                    type="number"
                    value={ nextDay[ k ] }
                    disabled={ isReadOnly }
                    onChange={ e =>
                    {
                      setHasUserEdited( true )
                      setNextDay( {
                        ...nextDay,
                        [ k ]: Math.min(
                          Number( e.target.value ) || 0,
                          closing[ k ]
                        ),
                      } )
                    } }
                  />
                </td>
                <td className="text-right">
                  ₹{ ( nextDay[ k ] * v ).toFixed( 2 ) }
                </td>
              </tr>
            ) ) }

            {/* TOTAL */ }
            <tr className="border-t text-lg font-bold">
              <td>Next Day Total</td>
              <td />
              <td className="text-right">₹{ nextDayTotal.toFixed( 2 ) }</td>
            </tr>

          </tbody>

        </table>
      </Card>

      {/* AVAILABLE CASH */ }
      <Card className="p-4">
        <h3 className="font-bold mb-2">Available Cash (Auto Calculated)</h3>
        <table className="w-full text-sm">
          <tbody>
            { DENOMS.map( ( [ l, k, v ] ) =>
              availableDenoms[ k ] > 0 ? (
                <tr key={ k }>
                  <td>{ l } × { availableDenoms[ k ] }</td>
                  <td />
                  <td className="text-right">
                    ₹{ ( availableDenoms[ k ] * v ).toFixed( 2 ) }
                  </td>
                </tr>
              ) : null
            ) }
            <tr className="border-t font-bold">
              <td>Available Cash Total</td>
              <td />
              <td className="text-right">₹{ availableCash.toFixed( 2 ) }</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card className="p-3">
        <label className="text-sm font-semibold">Closed By <span className="text-red-500">*</span></label>

        { savedNames.length > 0 && (
          <select
            className="w-full border rounded px-2 py-1 mb-2"
            disabled={ isReadOnly }
            onChange={ e => setClosedBy( e.target.value ) }
            value=""
          >
            <option value="">Select saved name</option>
            { savedNames.map( name => (
              <option key={ name } value={ name }>{ name }</option>
            ) ) }
          </select>
        ) }

        <Input
          ref={ closedByRef }
          value={ closedBy }
          disabled={ isReadOnly }
          onChange={ e => setClosedBy( e.target.value ) }
          placeholder="type name"
        />
      </Card>


      {/* PRINT PREVIEW */ }
      {/* PRINT PREVIEW */ }
      <Card
        ref={ printRef }
        className="receipt p-3 text-sm"
      >
        <div className="center bold">Smart Mart & Smart Fashions</div>
        <div className="center bold">{ user.counterName }</div>
        <div className="center text-xs">{ entry.date }</div>
        <div className="line" />

        <table>
          <tbody>
            <tr>
              <td>Opening Cash</td>
              <td className="right">₹{ openingCash.toFixed( 2 ) }</td>
            </tr>
            <tr>
              <td>Total Sales</td>
              <td className="right">
                ₹{ ( cashSales + totalIn + totalOut ).toFixed( 2 ) }
              </td>
            </tr>
            <tr>
              <td>Cash Sales</td>
              <td className="right">₹{ cashSales.toFixed( 2 ) }</td>
            </tr>
            <tr>
              <td>Payments IN</td>
              <td className="right">₹{ totalIn.toFixed( 2 ) }</td>
            </tr>
            <tr>
              <td>Payments OUT</td>
              <td className="right">₹{ totalOut.toFixed( 2 ) }</td>
            </tr>
            <tr className="bold">
              <td>Expected Cash</td>
              <td className="right">₹{ expectedCash.toFixed( 2 ) }</td>
            </tr>
            <tr className="bold">
              <td>Actual Cash</td>
              <td className="right">₹{ actualCash.toFixed( 2 ) }</td>
            </tr>
            <tr className="bold">
              <td>{ shortage > 0 ? "SHORTAGE" : "EXCESS" }</td>
              <td className="right">
                ₹{ Math.abs( shortage ).toFixed( 2 ) }
              </td>
            </tr>
          </tbody>
        </table>

        <div className="line" />
        <div className="center bold">Available Cash Denominations</div>

        <table>
          <tbody>
            { DENOMS.map( ( [ label, key, value ] ) =>
              availableDenoms[ key ] > 0 ? (
                <tr key={ key }>
                  <td>
                    { label } × { availableDenoms[ key ] }
                  </td>
                  <td className="right">
                    ₹{ ( availableDenoms[ key ] * value ).toFixed( 2 ) }
                  </td>
                </tr>
              ) : null
            ) }
            <tr className="bold">
              <td>Available Cash Total</td>
              <td className="right">₹{ availableCash.toFixed( 2 ) }</td>
            </tr>
          </tbody>
        </table>

        <div className="line" />
        <div className="flex justify-between bold">
          <span>Closed By </span>
          <span>{ closedBy || "-" }</span>
        </div>
      </Card>












































      { !isReadOnly && (
        <Button onClick={ handleSubmit } className="w-full">
          Submit Day
        </Button>
      ) }

      <Button variant="outline" className="w-full" onClick={ handlePrint }>
        <Printer className="w-4 h-4 mr-2" />
        Print Cash Summary
      </Button>

    </div>
  )
}

