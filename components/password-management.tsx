"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { changePassword } from "@/app/actions/password"
import {
  ChevronRight,
  CheckCircle,
  KeyRound,
  Eye,
  EyeOff,
  Store,
  ShieldCheck,
  UserCog,
  PackageSearch,
  ArrowLeft,
} from "lucide-react"
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/validation"
import PageShell from "./page-shell"
import StatusChip from "./status-chip"
import SectionHeader from "./section-header"

interface PasswordManagementProps {
  users: Array<{
    _id: string
    username: string
    role: string
    counterName?: string
  }>
}

const ROLE: Record<string, { label: string; icon: typeof Store; order: number }> = {
  admin: { label: "Admin", icon: ShieldCheck, order: 0 },
  supervisor: { label: "Supervisor", icon: UserCog, order: 1 },
  purchase: { label: "Purchase", icon: PackageSearch, order: 2 },
  counter: { label: "Counter", icon: Store, order: 3 },
}

const displayName = (u: PasswordManagementProps["users"][number]) =>
  u.counterName || ROLE[u.role]?.label || u.username

export default function PasswordManagement({ users }: PasswordManagementProps) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setSelectedUser(null)
    setNewPassword("")
    setConfirmPassword("")
    setShow(false)
    setError("")
    setSuccess("")
  }

  const handleChangePassword = async (userId: string) => {
    setError("")
    setSuccess("")

    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      const result = await changePassword(userId, "", newPassword)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess("Password changed successfully")
        setNewPassword("")
        setConfirmPassword("")
        setTimeout(reset, 1500)
      }
    } catch (err) {
      setError("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const selectedUserData = users.find((u) => u._id === selectedUser)
  const sorted = [...users].sort(
    (a, b) =>
      (ROLE[a.role]?.order ?? 9) - (ROLE[b.role]?.order ?? 9) ||
      displayName(a).localeCompare(displayName(b))
  )

  return (
    <PageShell
      title="Passwords"
      subtitle="Change the password for any account"
      backHref="/admin"
      backLabel="Back to dashboard"
    >
      {!selectedUser ? (
        <Card className="p-2">
          <div className="divide-y">
            {sorted.map((user) => {
              const meta = ROLE[user.role] ?? ROLE.counter
              const Icon = meta.icon
              return (
                <button
                  key={user._id}
                  onClick={() => setSelectedUser(user._id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary/60"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{displayName(user)}</div>
                    <div className="text-xs text-muted-foreground">
                      Username: {user.username}
                    </div>
                  </div>
                  <StatusChip tone="neutral" dot={false}>
                    {meta.label}
                  </StatusChip>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <button
            onClick={reset}
            disabled={loading}
            className="-ml-1 mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All accounts
          </button>

          <SectionHeader
            icon={<KeyRound className="size-4" />}
            title="Change password"
            subtitle={selectedUserData ? displayName(selectedUserData) : undefined}
          />

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium">
                New password
              </label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={show ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  disabled={loading}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm password
              </label>
              <Input
                id="confirmPassword"
                type={show ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type it again"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
                <CheckCircle className="size-4" />
                {success}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="lg" onClick={reset} disabled={loading} className="flex-1">
                Cancel
              </Button>
              <Button
                size="lg"
                onClick={() => handleChangePassword(selectedUser)}
                disabled={loading || !newPassword || !confirmPassword}
                className="flex-1"
              >
                {loading ? "Saving…" : "Change password"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </PageShell>
  )
}
