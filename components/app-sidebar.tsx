"use client";

import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
} from "@/components/ui/sidebar";
import { createBrowserClient } from "@/lib/supabase/client";
import { FileText, LayoutDashboard, LogOut, Network, PcCase, Settings, User2Icon, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Files", href: "/dashboard/files", icon: FileText },
    { name: "Tools", href: "/dashboard/files", icon: Wrench },
    { name: "workflow", href: "/dashboard/files", icon: Network },
    { name: "admin", href: "/dashboard/files", icon: User2Icon },
    { name: "API", href: "/dashboard/files", icon: FileText },
    { name: "Case", href: "/dashboard/case", icon: PcCase },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

const supabase = createBrowserClient();




export function AppSidebar() {
    const router = useRouter();
    const { session, isLoading: loading } = useAuth();
    const [userRole, setUserRole] = useState<string>("");

    useEffect(() => {
        if (session?.user) {
            setUserRole(session.user.user_metadata.role);
        }
    }, [session]);

    // Define which links each role can see :contentReference[oaicite:7]{index=7}
    const allowedForUser = ["Case", "Settings"];
    const allowedByDefault = ["Dashboard", "Files", "Tools", "workflow", "API", "Settings"];
    const filteredNav = userRole === "user"
        ? navItems.filter(item => allowedForUser.includes(item.name))
        : navItems.filter(item => allowedByDefault.includes(item.name));

    const handleSignOut = async () => {
        await supabase.auth.signOut(); // Supabase sign‑out :contentReference[oaicite:8]{index=8}
        router.push("/");              // optional redirect
    };

    return (
        <Sidebar>
            <SidebarHeader>
                <h2 className="text-xl font-bold flex gap">
                    <img src="/logo.svg" alt="" /> Verilex AI
                </h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    {!!session?.user && navItems.map(item => (
                        <Link key={item.href} href={item.href}>
                            <Button variant="ghost" className="w-full justify-start">
                                <item.icon className="mr-2 h-4 w-4" />
                                {item.name}
                            </Button>
                        </Link>
                    ))} {/* mapping list to UI elements :contentReference[oaicite:9]{index=9} */}
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
    );
}
