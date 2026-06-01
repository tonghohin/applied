"use client";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled>
          <RiSunLine />
          Toggle theme
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setTheme(isDark ? "light" : "dark")}
        tooltip={isDark ? "Switch to light" : "Switch to dark"}
      >
        {isDark ? <RiSunLine /> : <RiMoonLine />}
        {isDark ? "Light mode" : "Dark mode"}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
