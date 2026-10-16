"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import
{
  addPayment,
  cancelVendorPayment,
  deletePayment,
  updatePayment,
  updatePaymentRef, // ✅ REQUIRED
} from "@/app/actions/counter"
import type { DayEntry, Payment } from "@/lib/types"
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Receipt,
  Truck,
} from "lucide-react"
import SectionHeader from "@/components/section-header"
import { inr as money } from "@/lib/report"
import StatusChip from "@/components/status-chip"
import VendorPaymentSection from "@/components/vendor-payment-section"
import { todayIST } from "@/lib/report"

interface PaymentsPageProps
{
  entry: DayEntry
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
  /** updates the shared entry so the other pages see the change straight away */
  onEntryPatch?: ( patch: Partial<DayEntry> ) => void
}

export default function PaymentsPage ( {
  entry,
  isReadOnly,
  onEntryPatch,
}: PaymentsPageProps )
{
  /* ================= PAYMENTS STATE ================= */

  const [ payments, setPayments ] = useState<Payment[]>( entry.payments )

  useEffect( () =>
  {
    setPayments( entry.payments )
  }, [ entry.date, entry.payments ] )

  /* ================= PAYMENT REF STATE ================= */

  const [ paymentRef, setPaymentRef ] = useState( "" )

  // 🔒 SAFE one-time sync when date changes ONLY
  useEffect( () =>
  {
    if ( entry.paymentRefNumber && !paymentRef )
    {
      setPaymentRef( entry.paymentRefNumber )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ entry.date ] )

  /* ================= ADD FORM ================= */

  const [ desc, setDesc ] = useState( "" )
  const [ amount, setAmount ] = useState( "" )
  const [ type, setType ] = useState<"IN" | "OUT">( "OUT" )

  /* ================= EDIT STATE ================= */

  const [ editingIndex, setEditingIndex ] = useState<number | null>( null )
  const [ editDesc, setEditDesc ] = useState( "" )
  const [ editAmount, setEditAmount ] = useState( "" )
  const [ editType, setEditType ] = useState<"IN" | "OUT">( "OUT" )

  /* ================= CALCULATIONS ================= */

  const totalOut = payments
    .filter( p => ( p.type ?? "OUT" ) === "OUT" )
    .reduce( ( s, p ) => s + p.amount, 0 )

  const totalIn = payments
    .filter( p => ( p.type ?? "OUT" ) === "IN" )
    .reduce( ( s, p ) => s + p.amount, 0 )

  const netMovement = totalIn - totalOut

  /* ================= AUTOSAVE PAYMENT REF (NO REFRESH) ================= */

  useEffect( () =>
  {
    if ( isReadOnly ) return
    if ( !paymentRef.trim() ) return
    if ( payments.length === 0 ) return

    const timer = setTimeout( () =>
    {
      updatePaymentRef( entry.date, paymentRef.trim() ).then( res =>
      {
        if ( !res.error ) onEntryPatch?.( { paymentRefNumber: paymentRef.trim() } )
      } )
    }, 800 ) // ⏱ debounce

    return () => clearTimeout( timer )
  }, [ paymentRef, payments.length, isReadOnly, entry.date ] )

  /* ================= ACTIONS ================= */

  const [ busy, setBusy ] = useState( false )
  const [ error, setError ] = useState( "" )

  /** Runs a change on the server and shows exactly what was saved. */
  const apply = async (
    run: () => Promise<{ error?: string; payments?: Payment[] }>
  ): Promise<boolean> =>
  {
    setError( "" )
    setBusy( true )
    try
    {
      const res = await run()
      if ( res.error || !res.payments )
      {
        setError( res.error || "Could not save. Please try again." )
        return false
      }
      setPayments( res.payments )
      onEntryPatch?.( { payments: res.payments } )
      return true
    } catch
    {
      setError( "Could not save. Check your connection and try again." )
      return false
    } finally
    {
      setBusy( false )
    }
  }

  const handleAdd = async () =>
  {
    const amt = Number( amount )
    if ( !desc.trim() || isNaN( amt ) || amt <= 0 ) return

    if ( await apply( () => addPayment( desc, amt, type, entry.date ) ) )
    {
      setDesc( "" )
      setAmount( "" )
      setType( "OUT" )
    }
  }

  const handleDelete = async ( index: number ) =>
  {
    if ( !confirm( "Delete this entry?" ) ) return
    await apply( () => deletePayment( index, entry.date ) )
  }

  const handleCancelVendorPayment = async ( p: Payment ) =>
  {
    if ( !p.vendorPaymentId ) return
    if ( !confirm( `Cancel the ₹${ money( p.amount ) } payment to the vendor? The vendor's balance goes back up.` ) ) return
    await apply( async () =>
    {
      const res = await cancelVendorPayment( p.vendorPaymentId! )
      return { error: res.error, payments: "payments" in res ? ( res.payments as unknown as Payment[] ) : undefined }
    } )
  }

  const startEdit = ( index: number ) =>
  {
    const p = payments[ index ]
    setEditingIndex( index )
    setEditDesc( p.description )
    setEditAmount( p.amount.toString() )
    setEditType( p.type ?? "OUT" )
  }

  const saveEdit = async () =>
  {
    if ( editingIndex === null ) return

    const amt = Number( editAmount )
    if ( !editDesc.trim() || isNaN( amt ) || amt <= 0 ) return

    if ( await apply( () => updatePayment( editingIndex, editDesc, amt, editType, entry.date ) ) )
    {
      setEditingIndex( null )
    }
  }

  /* ================= JSX ================= */

  // vendor payments and transfers are made today, so earlier days are view-only for them
  const isToday = entry.date === todayIST()

  return (
    <div className="space-y-5">
      <VendorPaymentSection
        isReadOnly={ isReadOnly || !isToday }
        onPaid={ list =>
        {
          setPayments( list )
          onEntryPatch?.( { payments: list } )
        } }
      />

      <Card className="p-5">
        <SectionHeader
          icon={ <Receipt className="size-4" /> }
          title="Cash movements"
          subtitle="Money paid out of, or received into, your drawer today"
        />

        {/* ADD FORM */ }
        { !isReadOnly && (
          <div className="mt-4 space-y-3 rounded-xl bg-secondary/60 p-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-1">
              { ( [ "OUT", "IN" ] as const ).map( t => (
                <button
                  key={ t }
                  type="button"
                  onClick={ () => setType( t ) }
                  className={ `flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${ type === t
                    ? t === "OUT"
                      ? "bg-danger-soft text-danger"
                      : "bg-success-soft text-success"
                    : "text-muted-foreground hover:text-foreground"
                    }` }
                >
                  { t === "OUT" ? <ArrowUpRight className="size-4" /> : <ArrowDownLeft className="size-4" /> }
                  { t === "OUT" ? "Money out" : "Money in" }
                </button>
              ) ) }
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
              <Input
                placeholder="What is it for?"
                value={ desc }
                onChange={ e => setDesc( e.target.value ) }
              />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  ₹
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={ amount }
                  onChange={ e => setAmount( e.target.value ) }
                  onKeyDown={ e => e.key === "Enter" && handleAdd() }
                  className="pl-7"
                />
              </div>
              <Button onClick={ handleAdd } disabled={ busy || !desc.trim() || !( Number( amount ) > 0 ) }>
                <Plus /> Add
              </Button>
            </div>
          </div>
        ) }

        { error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{ error }</p>
        ) }

        {/* LIST */ }
        <div className="mt-4 space-y-2">
          { payments.length === 0 && (
            <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              No cash movements yet today.
            </div>
          ) }

          { payments.map( ( p, i ) =>
          {
            const effectiveType = p.type ?? "OUT"
            const isOut = effectiveType === "OUT"

            if ( editingIndex === i )
            {
              return (
                <div key={ i } className="space-y-2 rounded-xl border-2 border-primary/30 bg-accent/40 p-3">
                  <select
                    value={ editType }
                    onChange={ e => setEditType( e.target.value as "IN" | "OUT" ) }
                    className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                  >
                    <option value="OUT">Money out</option>
                    <option value="IN">Money in</option>
                  </select>
                  <div className="grid grid-cols-[1fr_8rem] gap-2">
                    <Input value={ editDesc } onChange={ e => setEditDesc( e.target.value ) } />
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={ editAmount }
                      onChange={ e => setEditAmount( e.target.value ) }
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={ () => setEditingIndex( null ) }>
                      <X /> Cancel
                    </Button>
                    <Button size="sm" onClick={ saveEdit } disabled={ busy }>
                      <Check /> Save
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={ i }
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <div
                  className={ `grid size-10 shrink-0 place-items-center rounded-full ${ p.transferId || p.vendorPaymentId
                    ? "bg-info-soft text-info"
                    : isOut
                      ? "bg-danger-soft text-danger"
                      : "bg-success-soft text-success"
                    }` }
                >
                  { p.transferId ? (
                    <ArrowRightLeft className="size-4" />
                  ) : p.vendorPaymentId ? (
                    <Truck className="size-4" />
                  ) : isOut ? (
                    <ArrowUpRight className="size-4" />
                  ) : (
                    <ArrowDownLeft className="size-4" />
                  ) }
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{ p.description }</div>
                  <div className="text-xs text-muted-foreground">
                    { new Date( p.time ).toLocaleTimeString( "en-IN", { hour: "2-digit", minute: "2-digit" } ) }
                    { p.transferId && <span className="ml-1.5 align-middle"><StatusChip tone="info" dot={ false }>Transfer</StatusChip></span> }
                    { p.vendorPaymentId && <span className="ml-1.5 align-middle"><StatusChip tone="info" dot={ false }>Vendor</StatusChip></span> }
                  </div>
                </div>

                <div className={ `text-sm font-semibold ${ isOut ? "text-danger" : "text-success" }` }>
                  { isOut ? "−" : "+" }₹{ money( p.amount ) }
                </div>

                { !isReadOnly && p.vendorPaymentId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={ () => handleCancelVendorPayment( p ) }
                    disabled={ busy }
                    aria-label="Cancel vendor payment"
                    title="Cancel vendor payment"
                  >
                    <X />
                  </Button>
                ) }

                { !isReadOnly && !p.transferId && !p.vendorPaymentId && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-9" onClick={ () => startEdit( i ) } aria-label="Edit">
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-danger hover:bg-danger-soft hover:text-danger"
                      onClick={ () => handleDelete( i ) }
                      aria-label="Delete"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) }
              </div>
            )
          } ) }
        </div>

        {/* TOTALS */ }
        <div className="mt-5 grid grid-cols-3 divide-x rounded-xl border bg-secondary/40">
          <div className="p-3">
            <div className="text-xs text-muted-foreground">Money in</div>
            <div className="mt-0.5 text-base font-semibold text-success">₹{ money( totalIn ) }</div>
          </div>
          <div className="p-3">
            <div className="text-xs text-muted-foreground">Money out</div>
            <div className="mt-0.5 text-base font-semibold text-danger">₹{ money( totalOut ) }</div>
          </div>
          <div className="p-3">
            <div className="text-xs text-muted-foreground">Net effect</div>
            <div className="mt-0.5 text-base font-semibold">
              { netMovement < 0 ? "−" : "" }₹{ money( Math.abs( netMovement ) ) }
            </div>
          </div>
        </div>
      </Card>

      {/* PAYMENT REF */ }
      { payments.length > 0 && (
        <Card className="border-warning/30 bg-warning-soft p-5">
          <label className="text-sm font-semibold">
            Payment entry number <span className="text-danger">*</span>
          </label>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Required before the day can be submitted, because payments were recorded.
          </p>
          { isReadOnly ? (
            <div className="rounded-lg border bg-card p-2.5 font-mono text-sm">
              { entry.paymentRefNumber || "—" }
            </div>
          ) : (
            <Input
              value={ paymentRef }
              onChange={ e => setPaymentRef( e.target.value ) }
              placeholder="Billing / payment reference number"
            />
          ) }
        </Card>
      ) }

    </div>
  )
}
