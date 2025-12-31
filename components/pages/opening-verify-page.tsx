"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { DenominationCount } from "@/lib/types"
import { CheckCircle } from "lucide-react"
import { getYesterdayOpeningSource } from "@/app/actions/counter"

interface OpeningVerifyPageProps
{
  onVerify: () => Promise<void>
  isReadOnly: boolean
}

const DENOMS: Array<[ string, keyof DenominationCount, number ]> = [
  [ "₹500", "notes500", 500 ],
  [ "₹200", "notes200", 200 ],
  [ "₹100", "notes100", 100 ],
  [ "₹50", "notes50", 50 ],
  [ "₹20", "notes20", 20 ],
  [ "₹10", "notes10", 10 ],
  [ "₹10 (Coin)", "coins10", 10 ],
  [ "₹5 (Coin)", "coins5", 5 ],
  [ "₹2 (Coin)", "coins2", 2 ],
  [ "₹1 (Coin)", "coins1", 1 ],
]

export default function OpeningVerifyPage ( {
  onVerify,
  isReadOnly,
}: OpeningVerifyPageProps )
{
  const [ loading, setLoading ] = useState( true )
  const [ source, setSource ] = useState<{
    date: string
    cash: number | null
    denominations: DenominationCount | null
  } | null>( null )

  /* ================= FETCH FROM DB (PREVIOUS DAY) ================= */

  useEffect( () =>
  {
    getYesterdayOpeningSource().then( ( res ) =>
    {
      setSource( res )
      setLoading( false )
    } )
  }, [] )

  if ( loading )
  {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Loading opening cash…
      </Card>
    )
  }

  const d = source?.denominations
  const openingCash = source?.cash ?? 0

  return (
    <div className="space-y-4">

      {/* ================= OPENING VERIFY ================= */}
      <Card className="p-6 border-2 border-dashed">
        <h2 className="text-lg font-bold mb-2">
          Opening Cash Verification
        </h2>

        <p className="text-sm text-muted-foreground mb-4">
          Below cash is carried forward from the previous day.
          Please physically verify before starting the day.
        </p>

        <div className="text-sm mb-3">
          <strong>Source Date:</strong> { source?.date || "-" }
        </div>

        {/* ================= DENOMINATIONS ================= */}
        <table className="w-full text-sm mb-4">
          <tbody>
            { DENOMS.map( ( [ label, key, value ] ) => (
              <tr key={ key } className="border-b last:border-b-0">
                <td>{ label }</td>
                <td className="text-center font-medium">
                  { d?.[ key ] ?? 0 }
                </td>
                <td className="text-right">
                  ₹{ ( ( d?.[ key ] ?? 0 ) * value ).toFixed( 2 ) }
                </td>
              </tr>
            ) ) }
          </tbody>
        </table>

        <div className="border-t pt-2 flex justify-between font-bold">
          <span>Total Opening Cash</span>
          <span>₹{ openingCash.toFixed( 2 ) }</span>
        </div>

        {/* ================= VERIFY ACTION ================= */}
        { isReadOnly ? (
          <div className="flex items-center gap-2 text-green-600 font-semibold mt-4">
            <CheckCircle className="w-5 h-5" />
            Opening Cash Verified
          </div>
        ) : (
          <Button onClick={ onVerify } className="w-full mt-4">
            ✓ Verify Opening Cash
          </Button>
        ) }
      </Card>

    </div>
  )
}
