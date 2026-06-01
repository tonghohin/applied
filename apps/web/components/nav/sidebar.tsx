"use client";

import { AppliedIcon } from "@/components/applied-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import {
  RiBriefcaseLine,
  RiDashboardLine,
  RiHistoryLine,
  RiLogoutBoxLine,
  RiUserLine,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: RiDashboardLine, exact: true },
  { href: "/jobs", label: "Jobs", icon: RiBriefcaseLine, exact: false },
  { href: "/runs", label: "Runs", icon: RiHistoryLine, exact: false },
  { href: "/profile", label: "Profile", icon: RiUserLine, exact: false },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 justify-center pl-3">
        <div className="flex items-center gap-2">
          <AppliedIcon className="h-6" />
          <span className="truncate font-semibold text-primary dark:text-foreground">Applied</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2 pt-0">
        <SidebarMenu>
          {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
                isActive={exact ? pathname === href : pathname.startsWith(href)}
                tooltip={label}
              >
                <Icon />
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <ThemeToggle />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Sign out">
              <RiLogoutBoxLine />
              Sign out
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
