"use client"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
} from "@/components/ui/sidebar"
import { createBrowserClient } from "@/lib/supabase/client"
import { FileText, LayoutDashboard, LogOut, Settings } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "./ui/button"

const navItems = [
    {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        name: "Files",
        href: "/dashboard/files",
        icon: FileText,
    },
    {
        name: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
    },
];

const supabase = createBrowserClient();

export function AppSidebar() {
    const router = useRouter()
    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }
    return (
        <Sidebar>
            <SidebarHeader>
                <h2 className="text-xl font-bold">Admin Dashboard</h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    {navItems.map((item) => {
                        return (
                            <Link key={item.href} href={item.href}>
                                <Button variant={"ghost"} className="w-full justify-start">
                                    <item.icon className="mr-2 h-4 w-4" />
                                    {item.name}
                                </Button>
                            </Link>
                        )
                    })}
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <div className="p-4 border-t mt-auto">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={handleSignOut}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
