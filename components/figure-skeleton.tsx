/** A flat grey bar where a figure will appear, so a total is never shown as ₹0 while it loads. */
export default function FigureSkeleton({ className = "h-5 w-24" }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-pulse rounded bg-secondary align-middle ${className}`} />
}
