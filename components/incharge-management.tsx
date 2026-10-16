"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserPlus, Users, RotateCcw, X } from "lucide-react"
import {
  addIncharge,
  getAllIncharges,
  setInchargeActive,
  type Incharge,
} from "@/app/actions/incharge"
import { GROUP_LABEL, type InchargeGroup } from "@/lib/incharge-group"
import PageShell from "./page-shell"
import SectionHeader from "./section-header"

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")

const WHERE: Record<InchargeGroup, string> = {
  counter: "They appear in the dropdowns on every shop counter (verifying opening cash, closing the day).",
  purchase: "They appear in the purchase counter's dropdowns (who handled a payment, who closed the day).",
}

export default function InchargeManagement({
  initialIncharges,
}: {
  initialIncharges: Incharge[]
}) {
  const [incharges, setIncharges] = useState(initialIncharges)
  const [group, setGroup] = useState<InchargeGroup>("counter")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const reload = async () => setIncharges(await getAllIncharges())

  const handleAdd = async () => {
    setError("")
    setBusy(true)
    const res = await addIncharge(name, group)
    setBusy(false)
    if (res.error) return setError(res.error)
    setName("")
    await reload()
  }

  const handleToggle = async (i: Incharge) => {
    if (i.active && !confirm(`Remove ${i.name} from the list?`)) return
    await setInchargeActive(i._id, !i.active)
    await reload()
  }

  const mine = incharges.filter((i) => i.group === group)
  const active = mine.filter((i) => i.active)
  const removed = mine.filter((i) => !i.active)
  const count = (g: InchargeGroup) => incharges.filter((i) => i.group === g && i.active).length

  return (
    <PageShell
      title="In-charges"
      subtitle="The people named on counter and purchase records"
      backHref="/admin"
      backLabel="Back to dashboard"
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-card p-1">
        {(["counter", "purchase"] as const).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroup(g)
              setError("")
            }}
            className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              group === g ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {GROUP_LABEL[g]} <span className="opacity-70">({count(g)})</span>
          </button>
        ))}
      </div>

      <Card className="p-5">
        <SectionHeader
          icon={<UserPlus className="size-4" />}
          title={group === "purchase" ? "Add purchase staff" : "Add a counter in-charge"}
          subtitle={WHERE[group]}
        />
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Full name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={busy || !name.trim()}>
            <UserPlus /> Add
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader
          icon={<Users className="size-4" />}
          title={`${GROUP_LABEL[group]}: active (${active.length})`}
        />
        {active.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            {group === "purchase"
              ? "No purchase staff yet. The purchase counter cannot pay vendors or close the day until you add at least one."
              : "No in-charges yet. Counters cannot verify opening cash or submit the day until you add at least one."}
          </div>
        ) : (
          <div className="mt-3 divide-y">
            {active.map((i) => (
              <div key={i._id} className="flex items-center gap-3 py-2.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {initials(i.name)}
                </div>
                <span className="flex-1 font-medium">{i.name}</span>
                <Button variant="ghost" size="sm" onClick={() => handleToggle(i)}>
                  <X /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {removed.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title={`Removed (${removed.length})`}
            subtitle="Kept so past records still show their name."
          />
          <div className="mt-3 divide-y">
            {removed.map((i) => (
              <div
                key={i._id}
                className="flex items-center gap-3 py-2.5 text-muted-foreground"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">
                  {initials(i.name)}
                </div>
                <span className="flex-1">{i.name}</span>
                <Button variant="outline" size="sm" onClick={() => handleToggle(i)}>
                  <RotateCcw /> Restore
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageShell>
  )
}
