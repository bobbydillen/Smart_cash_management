"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { DayEntry } from "@/lib/types"
import
{
  calculateCashSales,
  calculateClosingCash,
  calculatePaymentSummary,
  calculateExpectedCashWithInOut,
} from "@/lib/types"
import {
  X,
  Check,
  CheckCheck,
  Clock,
  Pencil,
  Undo2,
  ShieldAlert,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
} from "lucide-react"
import SectionHeader from "./section-header"
import { DENOMS, emptyDenoms, subtractDenoms } from "@/lib/next-day"
import { inr as fmt } from "@/lib/report"
import StatusChip from "./status-chip"
import {
  getOpeningOriginal,
  revertOpeningOverride,
  updateEntryOpeningCash,
} from "@/app/actions/admin"

/* ================= CONSTANTS ================= */

/* ================= PROPS ================= */

interface Props
{
  entry: DayEntry
  onClose: () => void
  onUpdate: () => void
  /** confirms this entry (same action as the Counter Status card) */
  onConfirm: () => Promise<void>
  /** supervisors can look but not confirm or override */
  readOnly?: boolean
}

/* ================= COMPONENT ================= */

export default function AdminEntryDetailModal ( {
  entry,
  onClose,
  onUpdate,
  onConfirm,
  readOnly = false,
}: Props )
{
  const [ openingCash, setOpeningCash ] = useState( entry.openingCash || 0 )
  const [ originalCash, setOriginalCash ] = useState<number | null>( null )
  const [ busy, setBusy ] = useState( false )
  const [ showOverride, setShowOverride ] = useState( false )

  // follow the saved value after an update, revert or refresh
  useEffect( () =>
  {
    setOpeningCash( entry.openingCash || 0 )
  }, [ entry.openingCash ] )

  // what the opening cash would be without an override
  useEffect( () =>
  {
    if ( readOnly ) return
    let stale = false
    getOpeningOriginal( entry._id! ).then( res =>
    {
      if ( !stale && "cash" in res ) setOriginalCash( res.cash ?? null )
    } )
    return () =>
    {
      stale = true
    }
  }, [ entry._id, entry.openingCash ] )

  const isOverridden =
    !!entry.openingOverride ||
    ( originalCash !== null && Math.abs( originalCash - ( entry.openingCash || 0 ) ) > 0.005 )

  /* ================= CALCULATIONS ================= */

  const isFashionBoth = entry.counterName === "Smart Fashion (Both)"

  const cashSales = calculateCashSales( entry.sales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  /* ===== SALES BREAKUP ===== */

  const martTotalSales = entry.sales.martTotalSales ?? 0
  const martCardSales = entry.sales.martCardUpi ?? 0
  const martCreditSales = entry.sales.martCredit ?? 0
  const martCashSales = martTotalSales - martCardSales - martCreditSales

  const fashionTotalSales = entry.sales.fashionTotalSales ?? 0
  const fashionCardSales = entry.sales.fashionCardUpi ?? 0
  const fashionCreditSales = entry.sales.fashionCredit ?? 0
  const fashionCashSales =
    fashionTotalSales - fashionCardSales - fashionCreditSales

  const totalSalesForAdmin = isFashionBoth
    ? martTotalSales + fashionTotalSales
    : entry.sales.totalSales ?? 0

  const totalCashSales = isFashionBoth
    ? martCashSales + fashionCashSales
    : cashSales

  const totalCardSales = isFashionBoth
    ? martCardSales + fashionCardSales
    : entry.sales.cardUpiSales ?? 0

  const totalCreditSales = isFashionBoth
    ? martCreditSales + fashionCreditSales
    : entry.sales.creditSales ?? 0

  /* ===== CASH RECONCILIATION ===== */

  const expectedCash = calculateExpectedCashWithInOut(
    openingCash,
    cashSales,
    entry.payments
  )

  const actualCash = calculateClosingCash( entry.closingDenominations )
  const shortage = expectedCash - actualCash

  const nextDayTotal = calculateClosingCash(
    entry.nextDayOpeningDenominations || emptyDenoms()
  )

  const availableDenoms = subtractDenoms(
    entry.closingDenominations,
    entry.nextDayOpeningDenominations || emptyDenoms()
  )

  const availableCash = calculateClosingCash( availableDenoms )

  const handoverOk =
    !!entry.availableCashHandedOver &&
    Math.abs( ( entry.availableCashHandedOverAmount ?? -1 ) - availableCash ) < 0.005

  /* ================= ACTION ================= */

  const handleOverrideOpening = async () =>
  {
    await updateEntryOpeningCash( entry._id!, openingCash )
    onUpdate()
    setShowOverride( false )
  }

  const handleRevert = async () =>
  {
    if (
      !confirm(
        `Remove the override and restore the opening cash to ₹${ ( originalCash ?? 0 ).toFixed( 2 ) }?`
      )
    )
      return
    setBusy( true )
    const res = await revertOpeningOverride( entry._id! )
    setBusy( false )
    if ( res.error ) return alert( res.error )
    onUpdate()
  }

  /* ================= JSX ================= */

  const flagged = entry.openingVerifyStatus === "not_verified"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={ e => e.target === e.currentTarget && onClose() }
    >
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:max-w-3xl sm:rounded-2xl">

        {/* HEADER */ }
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold leading-tight">{ entry.counterName }</h2>
              { entry.status === "open" && <StatusChip tone="info">Open</StatusChip> }
              { entry.status === "submitted" && <StatusChip tone="warning">Submitted</StatusChip> }
              { entry.status === "confirmed" && <StatusChip tone="success">Confirmed</StatusChip> }
            </div>
            <p className="text-sm text-muted-foreground">
              { new Date( entry.date + "T00:00:00" ).toLocaleDateString( "en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              } ) }
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={ onClose } aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">

          {/* ================= DAY SUMMARY ================= */ }
          <Card className="space-y-5 p-5">
            <SectionHeader title="Day summary" subtitle="Figures entered by the counter" />

            {/* opening */ }
            <div className="space-y-2">
              <Row label="Opening cash" value={ openingCash } bold />
              { entry.openingVerified && (
                <div
                  className={ `rounded-lg px-3 py-2 text-sm ${ flagged
                    ? "bg-warning-soft text-warning"
                    : "bg-success-soft text-success"
                    }` }
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    { flagged ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" /> }
                    { flagged ? "Opening could not be verified" : "Opening verified" }
                    { entry.openingVerifiedBy && <span className="font-normal">· { entry.openingVerifiedBy }</span> }
                  </div>
                  { entry.openingNote && <div className="mt-0.5">Reason: { entry.openingNote }</div> }
                  { ( entry.openingHistory?.length ?? 0 ) > 0 && (
                    <div className="mt-1 text-xs opacity-80">
                      Edited { entry.openingHistory!.length }× — earlier:{ " " }
                      { entry.openingHistory!
                        .map( h =>
                          `${ h.status === "not_verified" ? "not verified" : "verified" }${ h.by ? " by " + h.by : "" }${ h.note ? " (" + h.note + ")" : "" }`
                        )
                        .join( "; " ) }
                    </div>
                  ) }
                </div>
              ) }
            </div>

            {/* sales */ }
            <Block title="Sales">
              <Row label="Total sales" value={ totalSalesForAdmin } bold />
              { isFashionBoth ? (
                <>
                  <SubBlock title="Smart Mart">
                    <Row label="Cash" value={ martCashSales } />
                    <Row label="Card / UPI" value={ martCardSales } />
                    <Row label="Credit" value={ martCreditSales } />
                  </SubBlock>
                  <SubBlock title="Smart Fashion">
                    <Row label="Cash" value={ fashionCashSales } />
                    <Row label="Card / UPI" value={ fashionCardSales } />
                    <Row label="Credit" value={ fashionCreditSales } />
                  </SubBlock>
                  <div className="space-y-2 border-t pt-2">
                    <Row label="Total cash sales" value={ totalCashSales } bold />
                    <Row label="Total card / UPI" value={ totalCardSales } bold />
                    <Row label="Total credit" value={ totalCreditSales } bold />
                  </div>
                </>
              ) : (
                <>
                  <Row label="Cash" value={ cashSales } />
                  <Row label="Card / UPI" value={ totalCardSales } />
                  <Row label="Credit" value={ totalCreditSales } />
                </>
              ) }
            </Block>

            {/* payments */ }
            <Block title="Payments">
              <Row label="Money in" value={ totalIn } tone="success" sign="+" />
              <Row label="Money out" value={ totalOut } tone="danger" sign="−" />
            </Block>

            {/* reconciliation */ }
            <Block title="Reconciliation">
              <Row label="Expected cash" value={ expectedCash } bold />
              <Row label="Counted cash" value={ actualCash } bold />
              <div
                className={ `flex items-center justify-between rounded-xl px-4 py-3 ${ Math.abs( shortage ) < 0.005
                  ? "bg-success-soft text-success"
                  : shortage > 0
                    ? "bg-danger-soft text-danger"
                    : "bg-info-soft text-info"
                  }` }
              >
                <span className="text-sm font-semibold">
                  { Math.abs( shortage ) < 0.005 ? "Balanced" : shortage > 0 ? "Shortage" : "Excess" }
                </span>
                <span className="text-lg font-semibold">₹{ fmt( Math.abs( shortage ) ) }</span>
              </div>
            </Block>

            {/* next day + available */ }
            <Block title="Next day & available cash">
              <Row label="Next-day opening" value={ nextDayTotal } />
              <Row label="Available cash" value={ availableCash } bold />

              { DENOMS.some( ( [ , key ] ) => availableDenoms[ key ] > 0 ) && (
                <div className="space-y-1 rounded-xl bg-secondary/60 p-3">
                  { DENOMS.map( ( [ label, key, value ] ) =>
                  {
                    if ( availableDenoms[ key ] <= 0 ) return null
                    const checked = ( entry.availableCheckedDenoms || [] ).includes(
                      `${ key }:${ availableDenoms[ key ] }`
                    )
                    return (
                      <div key={ key } className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className={ `grid size-4 place-items-center rounded-full ${ checked ? "bg-success text-white" : "border border-muted-foreground/40"
                              }` }
                          >
                            { checked && <Check className="size-3" /> }
                          </span>
                          { label } × { availableDenoms[ key ] }
                        </span>
                        <span className="font-medium">₹{ fmt( availableDenoms[ key ] * value ) }</span>
                      </div>
                    )
                  } ) }
                </div>
              ) }

              <div
                className={ `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${ handoverOk ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                  }` }
              >
                { handoverOk ? <Check className="size-4" /> : <Clock className="size-4" /> }
                { handoverOk
                  ? `Available cash checked by counter${ entry.availableCashHandedOverAt
                    ? " at " + new Date( entry.availableCashHandedOverAt ).toLocaleTimeString( "en-IN", { hour: "2-digit", minute: "2-digit" } )
                    : "" }`
                  : "Available cash not checked" }
              </div>
            </Block>

            {/* status / confirm */ }
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div
                  className={ `font-semibold ${ entry.status === "confirmed"
                    ? "text-success"
                    : entry.status === "submitted"
                      ? "text-warning"
                      : "text-info"
                    }` }
                >
                  { entry.status === "confirmed"
                    ? "Confirmed"
                    : entry.status === "submitted"
                      ? "Submitted — awaiting your confirmation"
                      : "Open — not submitted yet" }
                </div>
                { entry.status === "confirmed" && entry.confirmedBy && (
                  <div className="text-xs text-muted-foreground">by { entry.confirmedBy }</div>
                ) }
              </div>

              { !readOnly && entry.status === "submitted" && (
                <Button size="lg" onClick={ onConfirm }>
                  <CheckCheck /> Confirm
                </Button>
              ) }
            </div>
          </Card>

          {/* ================= PAYMENTS ================= */ }
          <Card className="space-y-4 p-5">
            <SectionHeader title="Payment entries" subtitle="Cash in and out during the day" />

            <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Payment entry number</span>
              <span className="font-mono font-semibold">{ entry.paymentRefNumber || "—" }</span>
            </div>

            { entry.payments.length === 0 ? (
              <div className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                No payment entries recorded.
              </div>
            ) : (
              <div className="space-y-2">
                { entry.payments.map( ( p, i ) =>
                {
                  const isOut = ( p.type ?? "OUT" ) === "OUT"
                  return (
                    <div key={ i } className="flex items-center gap-3 rounded-xl border bg-card p-3">
                      <div
                        className={ `grid size-9 shrink-0 place-items-center rounded-full ${ p.transferId
                          ? "bg-info-soft text-info"
                          : isOut
                            ? "bg-danger-soft text-danger"
                            : "bg-success-soft text-success"
                          }` }
                      >
                        { p.transferId ? (
                          <ArrowRightLeft className="size-4" />
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
                        </div>
                      </div>
                      <div className={ `text-sm font-semibold ${ isOut ? "text-danger" : "text-success" }` }>
                        { isOut ? "−" : "+" }₹{ fmt( p.amount ) }
                      </div>
                    </div>
                  )
                } ) }
              </div>
            ) }

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Closed by</span>
              <span className="font-medium">{ entry.closedBy || "—" }</span>
            </div>
          </Card>

          {/* ================= OVERRIDE OPENING CASH ================= */ }
          { !readOnly && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Opening cash override</div>
                { isOverridden && !showOverride ? (
                  <div className="text-xs text-warning">
                    Overridden — original ₹{ fmt( originalCash ?? 0 ) }
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Correct the opening amount if it was wrong</div>
                ) }
              </div>
              <Button
                variant={ showOverride ? "default" : "outline"}
                onClick={ () =>
                {
                  setOpeningCash( entry.openingCash || 0 )
                  setShowOverride( v => !v )
                } }
              >
                <Pencil /> Override
              </Button>
            </div>

            { showOverride && (
              <div className="mt-4 space-y-3">
                { isOverridden && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                    <div>
                      <div className="font-semibold">Opening cash has been overridden</div>
                      <div>
                        Original (from previous day): <strong>₹{ fmt( originalCash ?? 0 ) }</strong>
                        { entry.openingOverride?.by && ` · by ${ entry.openingOverride.by }` }
                      </div>
                    </div>
                    <Button variant="outline" size="sm" disabled={ busy } onClick={ handleRevert }>
                      <Undo2 /> { busy ? "Reverting…" : "Revert override" }
                    </Button>
                  </div>
                ) }
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="h-10 w-full rounded-lg border bg-card pl-7 pr-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                      value={ openingCash }
                      onChange={ e => setOpeningCash( Number( e.target.value ) || 0 ) }
                    />
                  </div>
                  <Button onClick={ handleOverrideOpening }>Update</Button>
                </div>
              </div>
            ) }
          </Card>
          ) }

        </div>
      </div>
    </div>
  )
}

/* ================= HELPERS ================= */

function Row ( {
  label,
  value,
  bold = false,
  tone,
  sign,
}: {
  label: string
  value: number
  bold?: boolean
  tone?: "success" | "danger"
  sign?: string
} )
{
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={ bold ? "font-medium" : "text-muted-foreground" }>{ label }</span>
      <span
        className={ `${ bold ? "font-semibold" : "font-medium" } ${ tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : ""
          }` }
      >
        { sign }₹{ value.toLocaleString( "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 } ) }
      </span>
    </div>
  )
}

function Block ( { title, children }: { title: string; children: React.ReactNode } )
{
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ title }</div>
      { children }
    </div>
  )
}

function SubBlock ( { title, children }: { title: string; children: React.ReactNode } )
{
  return (
    <div className="space-y-2 rounded-xl bg-secondary/50 p-3">
      <div className="text-sm font-semibold">{ title }</div>
      { children }
    </div>
  )
}
