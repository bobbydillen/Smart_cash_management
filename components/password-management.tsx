"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { changePassword } from "@/app/actions/password"
import type { User } from "@/lib/auth"
import { ArrowLeft, Key, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface PasswordManagementProps {
  adminUser: User
  users: Array<{
    _id: string
    username: string
    role: string
    counterName?: string
  }>
}

export default function PasswordManagement({ adminUser, users }: PasswordManagementProps) {
  const router = useRouter()
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const handleChangePassword = async (userId: string) => {
    setError("")
    setSuccess("")

    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters")
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
        setTimeout(() => {
          setSelectedUser(null)
          setSuccess("")
        }, 1500)
      }
    } catch (err) {
      setError("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const selectedUserData = users.find((u) => u._id === selectedUser)

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Password Management</h1>
            <p className="text-sm text-muted-foreground">Change passwords for all users</p>
          </div>
          <Button onClick={() => router.push("/admin")} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {!selectedUser ? (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Select User</h2>
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors"
                  onClick={() => setSelectedUser(user._id)}
                >
                  <div>
                    <div className="font-semibold">
                      {user.role === "admin" ? "Admin" : user.counterName || user.username}
                    </div>
                    <div className="text-sm text-muted-foreground">Username: {user.username}</div>
                  </div>
                  <Key className="w-5 h-5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold">Change Password</h2>
              <p className="text-sm text-muted-foreground">
                {selectedUserData?.role === "admin"
                  ? "Admin"
                  : selectedUserData?.counterName || selectedUserData?.username}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="text-sm font-medium">
                  New Password
                </label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 4 characters)"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={loading}
                />
              </div>

              {error && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">{error}</div>}

              {success && (
                <div className="bg-green-100 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {success}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedUser(null)
                    setNewPassword("")
                    setConfirmPassword("")
                    setError("")
                    setSuccess("")
                  }}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleChangePassword(selectedUser)}
                  disabled={loading || !newPassword || !confirmPassword}
                  className="flex-1"
                >
                  {loading ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
