"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import
{
  addPayment,
  deletePayment,
  updatePayment,
} from "@/app/actions/counter"
import type { DayEntry } from "@/lib/types"
import { Plus, Trash2, Pencil, Check, X } from "lucide-react"

interface PaymentsPageProps
{
  entry: DayEntry
  refreshEntry: () => Promise<void>
  isReadOnly: boolean
}

export default function PaymentsPage ( {
  entry,
  refreshEntry,
  isReadOnly,
}: PaymentsPageProps )
{

  const [ desc, setDesc ] = useState( "" )
  const [ amount, setAmount ] = useState( "" )
  const [ type, setType ] = useState<"IN" | "OUT">( "OUT" )

  const [ editingIndex, setEditingIndex ] = useState<number | null>( null )
  const [ editDesc, setEditDesc ] = useState( "" )
  const [ editAmount, setEditAmount ] = useState( "" )
  const [ editType, setEditType ] = useState<"IN" | "OUT">( "OUT" )

  /* ---------- CALCULATIONS ---------- */
  const totalOut = entry.payments
    .filter( p => ( p.type ?? "OUT" ) === "OUT" )
    .reduce( ( s, p ) => s + p.amount, 0 )

  const totalIn = entry.payments
    .filter( p => ( p.type ?? "OUT" ) === "IN" )
    .reduce( ( s, p ) => s + p.amount, 0 )

  const netMovement = totalIn - totalOut

  /* ---------- ACTIONS ---------- */
  const handleAdd = async () =>
  {
    const amt = Number( amount )
    if ( !desc || isNaN( amt ) || amt <= 0 ) return

    await addPayment( desc, amt, type )
    await refreshEntry()

    setDesc( "" )
    setAmount( "" )
    setType( "OUT" )
  }

  const handleDelete = async ( index: number ) =>
  {
    if ( confirm( "Delete this entry?" ) )
    {
      await deletePayment( index )
      await refreshEntry()
    }
  }

  const startEdit = ( index: number ) =>
  {
    const p = entry.payments[ index ]
    setEditingIndex( index )
    setEditDesc( p.description )
    setEditAmount( p.amount.toString() )
    setEditType( p.type ?? "OUT" )
  }

  const saveEdit = async () =>
  {
    if ( editingIndex === null ) return
    const amt = Number( editAmount )
    if ( !editDesc || isNaN( amt ) || amt <= 0 ) return

    await updatePayment( editingIndex, editDesc, amt, editType )
    await refreshEntry()
    setEditingIndex( null )
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">
          Cash Movements (IN / OUT)
        </h2>

        {/* ADD FORM */ }
        { !isReadOnly && (
          <div className="flex gap-3 mb-4">
            <select
              value={ type }
              onChange={ ( e ) => setType( e.target.value as "IN" | "OUT" ) }
              className="border rounded px-2"
            >
              <option value="OUT">Money Out</option>
              <option value="IN">Money In</option>
            </select>

            <Input
              placeholder="Description"
              value={ desc }
              onChange={ ( e ) => setDesc( e.target.value ) }
              className="flex-1"
            />

            <Input
              type="number"
              placeholder="Amount"
              value={ amount }
              onChange={ ( e ) => setAmount( e.target.value ) }
              className="w-32"
            />

            <Button onClick={ handleAdd }>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        ) }

        {/* LIST */ }
        <div className="space-y-2">
          { entry.payments.map( ( p, i ) =>
          {
            const effectiveType = p.type ?? "OUT"
            return (
              <div
                key={ i }
                className={ `flex items-center gap-3 p-3 rounded-lg ${ effectiveType === "IN" ? "bg-green-50" : "bg-red-50"
                  }` }
              >
                { editingIndex === i ? (
                  <>
                    <select
                      value={ editType }
                      onChange={ ( e ) => setEditType( e.target.value as any ) }
                      className="border rounded px-2"
                    >
                      <option value="OUT">OUT</option>
                      <option value="IN">IN</option>
                    </select>

                    <Input
                      value={ editDesc }
                      onChange={ ( e ) => setEditDesc( e.target.value ) }
                      className="flex-1"
                    />

                    <Input
                      type="number"
                      value={ editAmount }
                      onChange={ ( e ) => setEditAmount( e.target.value ) }
                      className="w-32"
                    />

                    <Button size="sm" onClick={ saveEdit }>
                      <Check className="w-4 h-4" />
                    </Button>

                    <Button size="sm" variant="outline" onClick={ () => setEditingIndex( null ) }>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium">
                        { effectiveType === "IN" ? "➕" : "➖" } { p.description }
                      </div>
                      <div className="text-xs text-muted-foreground">
                        { new Date( p.time ).toLocaleTimeString( "en-IN" ) }
                      </div>
                    </div>

                    <div className="font-bold">
                      ₹{ p.amount.toFixed( 2 ) }
                    </div>

                    { !isReadOnly && (
                      <>
                        <Button size="sm" variant="outline" onClick={ () => startEdit( i ) }>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={ () => handleDelete( i ) }>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) }
                  </>
                ) }
              </div>
            )
          } ) }
        </div>

        {/* TOTALS */ }
        <div className="grid grid-cols-3 gap-4 mt-6 text-center">
          <div className="p-3 bg-green-100 rounded">
            <div className="text-sm">Money In</div>
            <div className="text-xl font-bold text-green-700">
              ₹{ totalIn.toFixed( 2 ) }
            </div>
          </div>

          <div className="p-3 bg-red-100 rounded">
            <div className="text-sm">Money Out</div>
            <div className="text-xl font-bold text-red-700">
              ₹{ totalOut.toFixed( 2 ) }
            </div>
          </div>

          <div className="p-3 bg-primary/10 rounded">
            <div className="text-sm">Net Effect</div>
            <div className="text-xl font-bold">
              ₹{ netMovement.toFixed( 2 ) }
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
