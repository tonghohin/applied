"use client";

import { AppliedIcon } from "@/components/applied-logo";
import { SearchRunStatusIndicator } from "@/components/nav/search-run-status-indicator";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import {
  RiArrowRightSLine,
  RiBriefcaseLine,
  RiDashboardLine,
  RiLogoutBoxLine,
  RiSettings3Line,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: RiDashboardLine, exact: true },
  {
    href: "/jobs",
    label: "Jobs",
    icon: RiBriefcaseLine,
    exact: false,
    badge: <SearchRunStatusIndicator />,
  },
];

const SETTINGS_LINKS = [
  { href: "/settings/personal", label: "Personal info" },
  { href: "/settings/documents", label: "Documents" },
  { href: "/settings/job-search", label: "Job search" },
  { href: "/settings/linkedin", label: "LinkedIn account" },
  { href: "/settings/ai", label: "AI provider" },
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
          {NAV_LINKS.map(({ href, label, icon: Icon, exact, badge }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
                isActive={exact ? pathname === href : pathname.startsWith(href)}
                tooltip={label}
              >
                <Icon />
                {label}
              </SidebarMenuButton>
              {badge}
            </SidebarMenuItem>
          ))}
          <Collapsible defaultOpen render={<SidebarMenuItem />}>
            <CollapsibleTrigger render={<SidebarMenuButton tooltip="Settings" />}>
              <RiSettings3Line />
              Settings
              <RiArrowRightSLine className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {SETTINGS_LINKS.map(({ href, label }) => (
                  <SidebarMenuSubItem key={href}>
                    <SidebarMenuSubButton
                      render={<Link href={href} />}
                      isActive={pathname === href}
                    >
                      <span>{label}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
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
