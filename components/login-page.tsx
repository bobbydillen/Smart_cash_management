"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { login } from "@/app/actions/auth"
import {
  Store,
  ShoppingBag,
  Sparkles,
  ShoppingCart,
  ShieldCheck,
  UserCog,
  PackageSearch,
  ArrowLeft,
  ChevronRight,
  Banknote,
  Eye,
  EyeOff,
} from "lucide-react"

const counters = [
  { name: "Smart Mart Counter 1", icon: Store, username: "mart1" },
  { name: "Smart Mart Counter 2", icon: ShoppingCart, username: "mart2" },
  { name: "Smart Mart Fancy", icon: Sparkles, username: "martfancy" },
  { name: "Smart Fashion (Both)", icon: ShoppingBag, username: "fashion" },
]

const management = [
  { name: "Admin", icon: ShieldCheck, username: "admin" },
  { name: "Supervisor", icon: UserCog, username: "supervisor" },
  { name: "Purchase", icon: PackageSearch, username: "purchase" },
]

const all = [...counters, ...management]

export default function LoginPage() {
  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const current = all.find((c) => c.username === selected)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return

    setError("")
    setLoading(true)

    const result = await login(selected, password)

    // If redirect happens, code below won't execute
    if (result && result.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  const back = () => {
    setSelected(null)
    setPassword("")
    setShow(false)
    setError("")
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        {/* brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-foreground text-background" aria-hidden="true">
            <Banknote className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Smart Cash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Smart Mart &amp; Smart Fashions
          </p>
        </div>

        {!selected ? (
          <div className="space-y-6">
            <p className="text-center text-sm text-muted-foreground">
              Choose where you are signing in
            </p>

            <div>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Counters</h2>
              <div className="space-y-2">
                {counters.map((c) => (
                  <RoleRow key={c.username} item={c} onClick={() => setSelected(c.username)} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Management</h2>
              <div className="space-y-2">
                {management.map((c) => (
                  <RoleRow key={c.username} item={c} onClick={() => setSelected(c.username)} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleLogin}
            className="space-y-5 rounded-2xl border bg-card p-6"
          >
            <button
              type="button"
              onClick={back}
              disabled={loading}
              className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> All accounts
            </button>

            <div className="flex items-center gap-3">
              {current && (
                <div className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <current.icon className="size-6" />
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">Signing in as</div>
                <div className="text-lg font-semibold leading-tight">{current?.name}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  autoFocus
                  disabled={loading}
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div id="login-error" role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading || !password} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

function RoleRow({
  item,
  onClick,
}: {
  item: { name: string; icon: React.ComponentType<{ className?: string }>; username: string }
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-5" />
      </div>
      <span className="flex-1 font-medium">{item.name}</span>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
