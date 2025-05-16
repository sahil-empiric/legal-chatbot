"use client";

import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
} from "@/components/ui/sidebar";
import { createBrowserClient } from "@/lib/supabase/client";
import { FileText, LayoutDashboard, LogOut, Network, PcCase, Settings, User2Icon, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Files", href: "/dashboard/files", icon: FileText },
    { name: "Case", href: "/dashboard/case", icon: PcCase },
    { name: "Tools", href: "#", icon: Wrench },
    { name: "Workflow", href: "#", icon: Network },
    { name: "Admin", href: "#", icon: User2Icon },
    { name: "API", href: "#", icon: FileText },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

const supabase = createBrowserClient();

export function AppSidebar() {
    const router = useRouter();
    const { session, isLoading: loading } = useAuth();
    const [userRole, setUserRole] = useState<string>("user");

    useEffect(() => {
        if (session?.user) {
            setUserRole(session.user.user_metadata.role);
        }
    }, [session]);

    // Define allowed nav items per role
    const allowedForUser = ["Tools", "Workflow", "Case", "Settings"];
    // const filteredNav = userRole === "user"
    //     ? navItems.filter(item => allowedForUser.includes(item.name))
    //     : userRole === "admin"
    //         ? navItems.filter(item => item.name !== "Case")
    //         : navItems;

    const filteredNav = userRole === "user"
        ? navItems.filter(item => allowedForUser.includes(item.name))
        : navItems.filter(item => item.name !== "Case");

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    return (
        <Sidebar>
            <SidebarHeader>
                <h2 className="text-xl font-bold flex gap-2 items-center">
                    <img src="/logo.svg" alt="" /> Verilex AI
                </h2>
                {/* <h2 className="text-xl font-bold mt-3 text-center">{!!session?.user && userRole === "user" ? "User" : "Admin"} Dashboard</h2> */}
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    {!!session?.user && filteredNav.map((item, index) => (
                        <Link key={index} href={item.href}>
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
