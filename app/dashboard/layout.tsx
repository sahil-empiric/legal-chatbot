"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import type React from "react"

import { createBrowserClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

// Initialize Supabase client
const supabase = createBrowserClient();

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, isLoading: loading } = useAuth();
  console.log('session', session)

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
