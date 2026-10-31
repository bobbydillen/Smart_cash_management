"use client"

import { useId } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"

/** Small heading above a group of rows, with an optional action on the right. */
export function GroupLabel ( {
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
} )
{
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <span className="text-sm font-semibold text-muted-foreground">
        { children }
      </span>
      { right }
    </div>
  )
}

/**
 * One denomination as a card: the value and its subtotal on top, a large stepper below.
 * The buttons are 44 px, the number is right under the label (and tied to it), and the phone
 * shows the numeric keypad. Lay several out in a grid (2 across on a phone).
 */
export function DenomRow ( {
  label,
  count,
  amount,
  onSet,
  disabled,
  max,
  sub,
}: {
  label: string
  count: number
  amount: number
  onSet: ( n: number ) => void
  disabled?: boolean
  max?: number
  sub?: string
} )
{
  const id = useId()
  const clamp = ( n: number ) => Math.max( 0, max === undefined ? n : Math.min( n, max ) )
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={ id } className="text-base font-semibold">
          { label }
          { sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{ sub }</span> }
        </label>
        <span className="text-sm tabular-nums text-muted-foreground">
          ₹{ amount.toLocaleString( "en-IN", { maximumFractionDigits: 0 } ) }
        </span>
      </div>

      { disabled ? (
        <output id={ id } className="mt-2 block text-xl font-semibold tabular-nums">{ count }</output>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={ () => onSet( clamp( count - 1 ) ) }
            disabled={ count <= 0 }
            aria-label={ `Fewer ${ label }` }
          >
            <Minus />
          </Button>
          <input
            id={ id }
            type="number"
            inputMode="numeric"
            min={ 0 }
            max={ max }
            value={ count }
            onChange={ e => onSet( clamp( Math.floor( Number( e.target.value ) || 0 ) ) ) }
            onWheel={ e => ( e.target as HTMLInputElement ).blur() }
            onFocus={ e => e.target.select() }
            className="h-11 min-w-0 flex-1 rounded-lg border bg-card text-center text-lg font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={ () => onSet( clamp( count + 1 ) ) }
            disabled={ max !== undefined && count >= max }
            aria-label={ `More ${ label }` }
          >
            <Plus />
          </Button>
        </div>
      ) }
    </div>
  )
}
