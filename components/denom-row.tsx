"use client"

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
    <div className="mb-2 mt-5 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        { children }
      </span>
      { right }
    </div>
  )
}

/** One denomination: label, - / + stepper, amount. */
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
  const clamp = ( n: number ) => Math.max( 0, max === undefined ? n : Math.min( n, max ) )
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      <div className="w-16 shrink-0">
        <div className="text-sm font-semibold">{ label }</div>
        { sub && <div className="text-[11px] text-muted-foreground">{ sub }</div> }
      </div>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        { !disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-full"
            onClick={ () => onSet( clamp( count - 1 ) ) }
            disabled={ count <= 0 }
            aria-label={ `Decrease ${ label }` }
          >
            <Minus />
          </Button>
        ) }
        <input
          type="number"
          inputMode="numeric"
          min={ 0 }
          max={ max }
          value={ count }
          disabled={ disabled }
          onChange={ e => onSet( clamp( Math.floor( Number( e.target.value ) || 0 ) ) ) }
          onWheel={ e => ( e.target as HTMLInputElement ).blur() }
          onFocus={ e => e.target.select() }
          className="h-9 w-16 rounded-lg border bg-card text-center text-sm font-semibold outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:border-transparent disabled:bg-transparent"
          aria-label={ `${ label } quantity` }
        />
        { !disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-full"
            onClick={ () => onSet( clamp( count + 1 ) ) }
            disabled={ max !== undefined && count >= max }
            aria-label={ `Increase ${ label }` }
          >
            <Plus />
          </Button>
        ) }
      </div>

      <div className="w-24 shrink-0 text-right text-sm font-medium">
        ₹{ amount.toLocaleString( "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 } ) }
      </div>
    </div>
  )
}
