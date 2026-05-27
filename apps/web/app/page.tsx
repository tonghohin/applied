import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-bold text-5xl">Applied</h1>
      <p className="max-w-md text-muted-foreground text-xl">
        Stop applying manually. Let AI handle it.
      </p>
      <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
        Get started
      </Button>
    </main>
  );
}
