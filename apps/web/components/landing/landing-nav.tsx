import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { label: "How it works", href: "#how", mobileHidden: true },
  { label: "Features", href: "#features", mobileHidden: true },
];

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-30 border-border border-b bg-background/80 backdrop-blur-md backdrop-saturate-150">
      <Container className="flex h-16 items-center justify-between">
        <Link href="#top" aria-label="Applied">
          <Image src="/lockup.svg" alt="Applied" width={96} height={32} />
        </Link>
        <div className="flex items-center gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              className={cn(
                "rounded-lg px-3 py-2 font-medium text-foreground text-sm no-underline transition-colors hover:bg-muted",
                link.mobileHidden && "max-[560px]:hidden"
              )}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
          <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
            Sign in
          </Button>
        </div>
      </Container>
    </nav>
  );
}
