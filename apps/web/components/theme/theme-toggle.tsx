"use client";

import { Button } from "@/components/ui/button";
import { RiComputerLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "system", label: "System", icon: RiComputerLine },
  { value: "light", label: "Light", icon: RiSunLine },
  { value: "dark", label: "Dark", icon: RiMoonLine },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-7 w-21" />;
  }

  const current = theme ?? "system";

  return (
    <div className="flex gap-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={current === value ? "outline" : "ghost"}
          size="icon-sm"
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={current === value}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
