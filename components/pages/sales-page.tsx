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
import type { User } from "@/lib/auth"
import
{
  calculateCashSales,
  calculatePaymentSummary,
} from "@/lib/types"
import { AlertCircle } from "lucide-react"

/* ================= FIXED NUMBER INPUT ================= */

const FixedNumberInput = ( props: React.ComponentProps<typeof Input> ) => (
  <Input
    { ...props }
    type="number"
    onWheel={ e => ( e.target as HTMLInputElement ).blur() }
  />
)

/* ================= PROPS ================= */

interface SalesPageProps
{
  entry: DayEntry
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
  user: User
}

/* ================= COMPONENT ================= */

export default function SalesPage ( {
  entry,
  refreshEntry,
  isReadOnly,
  user,
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
      if ( !res?.error && typeof res.cash === "number" )
      {
        setOpeningCash( res.cash )
      }
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

  const handleSave = async () =>
  {
    await updateSales( sales, entry.date )
    setSavedSales( sales )
    setHasUnsavedChanges( false )
  }

  /* ================= CALCULATIONS ================= */

  const previewCashSales = calculateCashSales( sales, isFashionBoth )
  const savedCashSales = calculateCashSales( savedSales, isFashionBoth )
  const { totalIn, totalOut } = calculatePaymentSummary( entry.payments )

  const expectedCash =
    openingCash + savedCashSales + totalIn - totalOut

  /* ================= JSX ================= */

  return (
    <div className="space-y-6">

      {/* UNSAVED WARNING */ }
      { hasUnsavedChanges && (
        <Card className="p-4 border-orange-500 bg-orange-50">
          <div className="flex items-center gap-2 text-orange-700">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">
              You have unsaved changes. Click “Save Sales”.
            </span>
          </div>
        </Card>
      ) }

      {/* SALES ENTRY */ }
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">
          Sales Entry (End of Day)
        </h2>

        {/* NORMAL COUNTER */ }
        { !isFashionBoth ? (
          <div className="space-y-4">

            <LabeledInput label="Total Sales">
              <FixedNumberInput
                value={ inputs.totalSales ?? sales.totalSales.toString() }
                onChange={ e => handleChange( "totalSales", e.target.value ) }
                disabled={ isReadOnly }
              />
            </LabeledInput>

            <LabeledInput label="Card / UPI">
              <FixedNumberInput
                value={ inputs.cardUpiSales ?? sales.cardUpiSales.toString() }
                onChange={ e => handleChange( "cardUpiSales", e.target.value ) }
                disabled={ isReadOnly }
              />
            </LabeledInput>

            <LabeledInput label="Credit Sales">
              <FixedNumberInput
                value={ inputs.creditSales ?? sales.creditSales.toString() }
                onChange={ e => handleChange( "creditSales", e.target.value ) }
                disabled={ isReadOnly }
              />
            </LabeledInput>

            <PreviewCash label="Cash Sales (Preview)" value={ previewCashSales } />
          </div>
        ) : (
          /* SMART FASHION (BOTH) */
          <div className="space-y-6">

            {/* SMART MART */ }
            <Section title="Smart Mart">
              <LabeledInput label="Total Sales">
                <FixedNumberInput
                  value={ inputs.martTotalSales ?? ( sales.martTotalSales ?? 0 ).toString() }
                  onChange={ e => handleChange( "martTotalSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>

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
            </Section>

            {/* SMART FASHION */ }
            <Section title="Smart Fashion">
              <LabeledInput label="Total Sales">
                <FixedNumberInput
                  value={ inputs.fashionTotalSales ?? ( sales.fashionTotalSales ?? 0 ).toString() }
                  onChange={ e => handleChange( "fashionTotalSales", e.target.value ) }
                  disabled={ isReadOnly }
                />
              </LabeledInput>

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
            </Section>

            <PreviewCash label="Total Cash Sales" value={ previewCashSales } />
          </div>
        ) }

        { !isReadOnly && (
          <Button
            onClick={ handleSave }
            disabled={ !hasUnsavedChanges }
            className="w-full mt-4"
          >
            { hasUnsavedChanges ? "Save Sales" : "Saved ✓" }
          </Button>
        ) }
      </Card>

      {/* EXPECTED CASH */ }
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Expected Cash (Saved)</h3>

        <SummaryRow label="Opening Cash" value={ openingCash } />
        <SummaryRow label="+ Cash Sales" value={ savedCashSales } green />
        <SummaryRow label="+ Money In" value={ totalIn } green />
        <SummaryRow label="- Money Out" value={ totalOut } red />

        <div className="border-t pt-2 flex justify-between font-bold">
          <span>Expected Cash</span>
          <span className="text-primary text-lg">
            ₹{ expectedCash.toFixed( 2 ) }
          </span>
        </div>
      </Card>

    </div>
  )
}

/* ================= SMALL UI HELPERS ================= */

const LabeledInput = ( { label, children }: any ) => (
  <div>
    <label className="text-sm font-medium mb-1 block">{ label }</label>
    { children }
  </div>
)

const Section = ( { title, children }: any ) => (
  <div>
    <h3 className="font-semibold mb-3">{ title }</h3>
    <div className="space-y-3">{ children }</div>
  </div>
)

const PreviewCash = ( { label, value }: any ) => (
  <div className="bg-secondary p-4 rounded-lg">
    <div className="flex justify-between font-bold">
      <span>{ label }</span>
      <span>₹{ value.toFixed( 2 ) }</span>
    </div>
  </div>
)

const SummaryRow = ( { label, value, green, red }: any ) => (
  <div
    className={ `flex justify-between text-sm ${ green ? "text-green-600" : red ? "text-red-600" : ""
      }` }
  >
    <span>{ label }</span>
    <span>₹{ value.toFixed( 2 ) }</span>
  </div>
)
