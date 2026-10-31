"use client"

import { useEffect, useRef, useState } from "react"
import Modal from "@/components/modal"
import { Button } from "@/components/ui/button"

/**
 * In-app replacements for the browser's confirm() and alert():
 *
 *   if (await ask("Cancel this transfer? The cash goes back to your drawer.")) { ... }
 *   await notify("Could not save. Try again.")
 *
 * They look like the rest of the app, say what will happen, put focus on the safe choice,
 * and work with the keyboard (Esc = no). <ConfirmHost /> is mounted once in the root layout.
 */

type Request =
  | { kind: "ask"; message: string; title?: string; confirmLabel?: string; resolve: (ok: boolean) => void }
  | { kind: "notify"; message: string; title?: string; resolve: () => void }

let push: ((r: Request) => void) | null = null

const DANGER = /\b(cancel|delete|remove|unlock|bounced|discard|clear)\b/i

export function ask(message: string, opts: { title?: string; confirmLabel?: string } = {}): Promise<boolean> {
  if (!push) return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false)
  return new Promise((resolve) => push!({ kind: "ask", message, resolve, ...opts }))
}

export function notify(message: string, opts: { title?: string } = {}): Promise<void> {
  const clean = message.replace(/^\s*❌\s*/, "")
  if (!push) {
    if (typeof window !== "undefined") window.alert(clean)
    return Promise.resolve()
  }
  return new Promise((resolve) => push!({ kind: "notify", message: clean, resolve, ...opts }))
}

export default function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const current = queue[0]
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r])
    return () => {
      push = null
    }
  }, [])

  if (!current) return null

  const done = (ok: boolean) => {
    if (current.kind === "ask") current.resolve(ok)
    else current.resolve()
    setQueue((q) => q.slice(1))
  }
  const danger = current.kind === "ask" && DANGER.test(current.message)
  // the confirm button names the action: "Yes, cancel", "Yes, delete", "Yes, mark as bounced"
  const verb = current.kind === "ask" ? current.message.match(DANGER)?.[1]?.toLowerCase() : undefined
  const confirmText = (current.kind === "ask" && current.confirmLabel) || (verb ? `Yes, ${verb === "bounced" ? "mark as bounced" : verb}` : "Yes, continue")

  return (
    <Modal
      key={queue.length + current.message}
      title={current.title ?? (current.kind === "notify" ? "Please note" : danger ? "Are you sure?" : "Please confirm")}
      onClose={() => done(false)}
    >
      <p className="text-base leading-relaxed">
        {current.message}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {current.kind === "ask" ? (
          <>
            <Button ref={cancelRef} variant="outline" size="lg" onClick={() => done(false)}>
              Go back
            </Button>
            <Button size="lg" variant={danger ? "destructive" : "default"} onClick={() => done(true)}>
              {confirmText}
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => done(true)}>
            OK
          </Button>
        )}
      </div>
    </Modal>
  )
}
