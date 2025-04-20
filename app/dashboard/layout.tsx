"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import type React from "react"

import { createBrowserClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

// Initialize Supabase client
const supabase = createBrowserClient();

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (error || !data.session) {
          router.push("/login")
          return
        }

        setLoading(false)
      } catch (error) {
        router.push("/login")
      }
    }

    checkSession()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )

  // return (
  //   <div className="min-h-screen flex">
  //     <DashboardSidebar />
  //     <main className="flex-1 p-6 overflow-auto">{children}</main>
  //   </div>
  // )
}
