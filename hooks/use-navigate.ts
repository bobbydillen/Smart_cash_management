"use client"

import { useRouter } from "next/navigation"
import { navStart } from "@/lib/nav-state"

/** Like router.push, but the page shows that it is loading straight away. */
export function useNavigate() {
  const router = useRouter()
  return (href: string) => {
    navStart()
    router.push(href)
  }
}
