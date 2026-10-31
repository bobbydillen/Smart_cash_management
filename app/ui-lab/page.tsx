import { notFound } from "next/navigation"
import Lab from "./lab"

/** Design previews. Development only: this page does not exist in a production build. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound()
  return <Lab />
}
