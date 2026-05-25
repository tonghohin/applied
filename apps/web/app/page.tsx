import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-bold">Applied</h1>
      <p className="text-xl text-muted-foreground max-w-md">
        Stop applying manually. Let AI handle it.
      </p>
      <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
        Get started
      </Button>
    </main>
  );
}
