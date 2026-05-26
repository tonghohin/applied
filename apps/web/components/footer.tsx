import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Applied</p>
        <ThemeToggle />
      </div>
    </footer>
  );
}
