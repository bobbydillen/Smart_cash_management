"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import Modal from "@/components/modal"
import TransferSection from "@/components/transfer-section"
import { ArrowRightLeft } from "lucide-react"

/**
 * "Transfer cash" as a button: the form opens in a pop-up only when it is needed.
 * Used by every counter, the purchase counter and the admin.
 */
export default function TransferButton({
  refreshEntry,
  onClosed,
  size = "sm",
  className,
}: {
  refreshEntry: () => Promise<void>
  /** called when the pop-up closes, so the page can show anything that was sent */
  onClosed?: () => void
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
    onClosed?.()
  }

  return (
    <>
      <Button variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <ArrowRightLeft /> Transfer cash
      </Button>
      {open && (
        <Modal title="Transfer cash" subtitle="Send cash to another counter or the admin" onClose={close}>
          <TransferSection embedded isReadOnly={false} refreshEntry={refreshEntry} />
        </Modal>
      )}
    </>
  )
}
