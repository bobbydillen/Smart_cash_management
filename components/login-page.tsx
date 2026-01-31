"use client"

import type React from "react"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { login } from "@/app/actions/auth"
import {
  Store,
  ShoppingBag,
  Sparkles,
  ShoppingCart,
  ShieldCheck,
} from "lucide-react"

const counters = [
  { id: "mart1", name: "Smart Mart Counter 1", icon: Store, username: "mart1" },
  { id: "mart2", name: "Smart Mart Counter 2", icon: ShoppingCart, username: "mart2" },
  { id: "martfancy", name: "Smart Mart Fancy", icon: Sparkles, username: "martfancy" },
  { id: "fashion", name: "Smart Fashion (Both)", icon: ShoppingBag, username: "fashion" },

  // ✅ NEW SUPERVISOR
  { id: "supervisor", name: "Supervisor", icon: ShieldCheck, username: "supervisor" },

  { id: "admin", name: "Admin", icon: ShieldCheck, username: "admin" },
]

export default function LoginPage() {
  const [selectedCounter, setSelectedCounter] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCounter) return

    setError("")
    setLoading(true)

    const result = await login(selectedCounter, password)

    // If redirect happens, code below won't execute
    if (result && result.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Smart Mart & Smart Fashions
          </h1>
          <p className="text-muted-foreground">Cash Management System</p>
        </div>

        {!selectedCounter ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {counters.map((counter) => {
              const Icon = counter.icon
              return (
                <Card
                  key={counter.id}
                  className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                  onClick={() => setSelectedCounter(counter.username)}
                >
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{counter.name}</h3>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-8 max-w-md mx-auto">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="text-center">
                {(() => {
                  const counter = counters.find(
                    (c) => c.username === selectedCounter
                  )
                  const Icon = counter?.icon
                  return (
                    <>
                      {Icon && (
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                          <Icon className="w-8 h-8 text-primary" />
                        </div>
                      )}
                      <h2 className="text-2xl font-bold">{counter?.name}</h2>
                    </>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Enter Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="text-destructive text-sm text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedCounter(null)
                    setPassword("")
                    setError("")
                  }}
                  disabled={loading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !password}
                  className="flex-1"
                >
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
