import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import ConfirmHost from "@/components/confirm-host"
import NavProgress from "@/components/nav-progress"

const geist = Geist( { subsets: [ "latin" ], variable: "--font-geist-sans" } )
const geistMono = Geist_Mono( { subsets: [ "latin" ], variable: "--font-geist-mono" } )

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f16" },
  ],
}

export const metadata: Metadata = {
  title: "Smart Cash Management",
  description: "Cash management system for Smart Mart & Smart Fashions",
}


export default function RootLayout ( {
  children,
}: Readonly<{
  children: React.ReactNode
}> )
{
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* applies the saved (or device) light/dark choice before the first paint, so there is no flash */}
        <script
          dangerouslySetInnerHTML={ {
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          } }
        />
      </head>
      <body className={ `${ geist.variable } ${ geistMono.variable } font-sans antialiased` }>
        { children }
        <NavProgress />
        <ConfirmHost />
        <Analytics />
      </body>
    </html>
  )
}
