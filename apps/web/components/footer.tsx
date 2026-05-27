import { AppliedIcon } from "@/components/applied-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <AppliedIcon />© {new Date().getFullYear()} Applied
        </p>
        <ThemeToggle />
      </div>
    </footer>
  );
}
