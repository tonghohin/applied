import { AppliedIcon } from "@/components/applied-logo";

export function Footer() {
  return (
    <footer className="border-t px-4 py-2">
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <AppliedIcon />© {new Date().getFullYear()} Applied
      </p>
    </footer>
  );
}
