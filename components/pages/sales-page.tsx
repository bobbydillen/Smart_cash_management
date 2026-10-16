"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import
{
  updateSales,
  getOpeningCashForDate,
} from "@/app/actions/counter"
import type { DayEntry, SalesData } from "@/lib/types"
import type { SerializedUser } from "@/lib/session"
import
{
  calculateCashSales,
  calculatePaymentSummary,
} from "@/lib/types"
import { AlertCircle, TrendingUp, Banknote, Check } from "lucide-react"
import SectionHeader from "@/components/section-header"

/* ================= MONEY INPUT ================= */

const FixedNumberInput = ( props: React.ComponentProps<typeof Input> ) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      ₹
    </span>
    <Input
      { ...props }
      type="number"
      inputMode="decimal"
      className="pl-7"
      onWheel={ e => ( e.target as HTMLInputElement ).blur() }
    />
  </div>
)

/* ================= PROPS ================= */

interface SalesPageProps
{
  entry: DayEntry
  isReadOnly: boolean
  user: SerializedUser
  /** updates the shared entry so the other pages see the saved sales straight away */
  onEntryPatch?: ( patch: Partial<DayEntry> ) => void
}

/* ================= COMPONENT ================= */

export default function SalesPage ( {
  entry,
  isReadOnly,
  user,
  onEntryPatch,
}: SalesPageProps )
{

  const isFashionBoth = user.counterName === "Smart Fashion (Both)"

  /* ================= STATE ================= */

  const [ sales, setSales ] = useState<SalesData>( entry.sales )
  const [ inputs, setInputs ] = useState<Record<string, string>>( {} )
  const [ hasUnsavedChanges, setHasUnsavedChanges ] = useState( false )

  const [ savedSales, setSavedSales ] = useState<SalesData>( entry.sales )
  const [ openingCash, setOpeningCash ] = useState( 0 )

  /* ================= SYNC ON DATE CHANGE ================= */

  useEffect( () =>
  {
    setSales( entry.sales )
    setSavedSales( entry.sales )
    setInputs( {} )
    setHasUnsavedChanges( false )
  }, [ entry.date ] )

  /* ================= OPENING CASH ================= */

  useEffect( () =>
  {
    getOpeningCashForDate( entry.date ).then( res =>
    {
      if ( "cash" in res ) setOpeningCash( res.cash )
    } )
  }, [ entry.date, entry.updatedAt ] )

  /* ================= HANDLERS ================= */

  const handleChange = ( key: keyof SalesData, value: string ) =>
  {
    setInputs( prev => ( { ...prev, [ key ]: value } ) )
    setSales( prev => ( {
      ...prev,
      [ key ]: value === "" ? 0 : Number( value ),
    } ) )
    setHasUnsavedChanges( true )
  }

  const [ saving, setSaving ] = useState( false )
  const [ saveError, setSaveError ] = useState( "" )

  const handleSave = async () =>
  {
    setSaveError( "" )
    setSaving( true )
    try
    {
      const res = await updateSales( sales, entry.date )
      if ( res.error )
      {
        setSaveError( res.error )
        return
      }
      setSavedSales( sales )
      setHasUnsavedChanges( false )
      onEntryPatch?.( { sales } )
    } catch
    {
      setSaveError( "Could not save. Check your connection and try again." )
    } finally
    {
      setSaving( false )
    }
  }

  /* ================= CALCULATIONS ================= */

  const previewCashSales = calculateCashSales( sales, isFashionBoth )
  const savedCashSales = calculateCashSales( savedSales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash =
    openingCash + savedCashSales + totalIn - totalOut

  /* ================= JSX ================= */

  return (
    <div className="space-y-5">

      {/* SALES ENTRY */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <TrendingUp className="size-4" /> }
          title="Sales entry"
          subtitle="Copy the day's totals from the billing software"
        />

        {/* NORMAL COUNTER */ }
        { !isFashionBoth ? (
          <div className="mt-4 space-y-4">
            <LabeledInput label="Total sales">
              <FixedNumberInput
                value={ inputs.totalSales ?? sales.totalSales.toString() }
                onChange={ e => handleChange( "totalSales", e.target.value ) }
                disabled={ isReadOnly }
              />
            </LabeledInput>

            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Card / UPI">
                <FixedNumberInput
                  value={ inputs.cardUpiSales ?? sales.cardUpiSales.toString() }
                  onChange={ e => handleChange( "cardUpiSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>

              <LabeledInput label="Credit">
                <FixedNumberInput
                  value={ inputs.creditSales ?? sales.creditSales.toString() }
                  onChange={ e => handleChange( "creditSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>
            </div>

            <PreviewCash label="Cash sales" value={ previewCashSales } />
          </div>
        ) : (
          /* SMART FASHION (BOTH) */
          <div className="mt-4 space-y-5">

            <Section title="Smart Mart">
              <LabeledInput label="Total sales">
                <FixedNumberInput
                  value={ inputs.martTotalSales ?? ( sales.martTotalSales ?? 0 ).toString() }
                  onChange={ e => handleChange( "martTotalSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput label="Card / UPI">
                  <FixedNumberInput
                    value={ inputs.martCardUpi ?? ( sales.martCardUpi ?? 0 ).toString() }
                    onChange={ e => handleChange( "martCardUpi", e.target.value ) }
                    disabled={ isReadOnly }
                  />
                </LabeledInput>
                <LabeledInput label="Credit">
                  <FixedNumberInput
                    value={ inputs.martCredit ?? ( sales.martCredit ?? 0 ).toString() }
                    onChange={ e => handleChange( "martCredit", e.target.value ) }
                    disabled={ isReadOnly }
                  />
                </LabeledInput>
              </div>
            </Section>

            <Section title="Smart Fashion">
              <LabeledInput label="Total sales">
                <FixedNumberInput
                  value={ inputs.fashionTotalSales ?? ( sales.fashionTotalSales ?? 0 ).toString() }
                  onChange={ e => handleChange( "fashionTotalSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput label="Card / UPI">
                  <FixedNumberInput
                    value={ inputs.fashionCardUpi ?? ( sales.fashionCardUpi ?? 0 ).toString() }
                    onChange={ e => handleChange( "fashionCardUpi", e.target.value ) }
                    disabled={ isReadOnly }
                  />
                </LabeledInput>
                <LabeledInput label="Credit">
                  <FixedNumberInput
                    value={ inputs.fashionCredit ?? ( sales.fashionCredit ?? 0 ).toString() }
                    onChange={ e => handleChange( "fashionCredit", e.target.value ) }
                    disabled={ isReadOnly }
                  />
                </LabeledInput>
              </div>
            </Section>

            <PreviewCash label="Total cash sales" value={ previewCashSales } />
          </div>
        ) }

        {/* UNSAVED WARNING + SAVE */ }
        { !isReadOnly && (
          <div className="mt-5 space-y-2">
            { saveError && (
              <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertCircle className="size-4 shrink-0" />
                { saveError }
              </div>
            ) }
            { hasUnsavedChanges && (
              <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertCircle className="size-4 shrink-0" />
                You have unsaved changes. Tap “Save sales”.
              </div>
            ) }
            <Button
              onClick={ handleSave }
              disabled={ !hasUnsavedChanges || saving }
              size="lg"
              variant={ hasUnsavedChanges ? "default" : "outline" }
              className="w-full"
            >
              { saving ? "Saving…" : hasUnsavedChanges ? "Save sales" : <><Check /> Saved</> }
            </Button>
          </div>
        ) }
      </Card>

      {/* EXPECTED CASH */ }
      <Card className="p-5">
        <SectionHeader
          icon={ <Banknote className="size-4" /> }
          title="Expected cash"
          subtitle="Based on the saved figures"
        />

        <div className="mt-4 space-y-2">
          <SummaryRow label="Opening cash" value={ openingCash } />
          <SummaryRow label="Cash sales" value={ savedCashSales } sign="+" tone="success" />
          <SummaryRow label="Money in" value={ totalIn } sign="+" tone="success" />
          <SummaryRow label="Money out" value={ totalOut } sign="−" tone="danger" />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-accent px-4 py-3">
          <span className="text-sm font-medium text-accent-foreground">Expected cash</span>
          <span className="text-xl font-semibold text-accent-foreground">
            ₹{ expectedCash.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
          </span>
        </div>
      </Card>

    </div>
  )
}

/* ================= SMALL UI HELPERS ================= */

const LabeledInput = ( { label, children }: any ) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium">{ label }</label>
    { children }
  </div>
)

const Section = ( { title, children }: any ) => (
  <div className="space-y-3 rounded-xl border p-4">
    <h3 className="text-sm font-semibold">{ title }</h3>
    { children }
  </div>
)

const PreviewCash = ( { label, value }: any ) => (
  <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
    <span className="text-sm font-medium">{ label }</span>
    <span className="text-lg font-semibold">
      ₹{ value.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
    </span>
  </div>
)

const SummaryRow = ( { label, value, sign, tone }: any ) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-muted-foreground">{ label }</span>
    <span
      className={ `font-medium ${ tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "" }` }
    >
      { sign }₹{ value.toLocaleString( "en-IN", { minimumFractionDigits: 2 } ) }
    </span>
  </div>
)
