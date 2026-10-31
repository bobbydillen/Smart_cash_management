import { createHmac } from "node:crypto"

/**
 * The reconciliation engine (api/recon.py) runs as a separate Python function, so it cannot read
 * this app's sign-in. Instead a signed-in admin is handed a short-lived token, signed with
 * RECON_SECRET, and the engine only accepts requests that carry one.
 *
 * Token format: "<expiry in seconds>.<hex hmac-sha256 of the expiry>", the same as api/recon.py checks.
 */
export function reconSecret(): string {
  // a fixed secret is fine on a developer's own machine only
  return process.env.RECON_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-dev-recon")
}

export function makeReconToken(hours = 12): string | null {
  const secret = reconSecret()
  if (!secret) return null
  const exp = String(Math.floor(Date.now() / 1000) + hours * 3600)
  const sig = createHmac("sha256", secret).update(exp).digest("hex")
  return `${exp}.${sig}`
}
