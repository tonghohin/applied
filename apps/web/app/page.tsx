export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-bold">Applied</h1>
      <p className="text-xl text-muted-foreground max-w-md">
        Stop applying manually. Let AI handle it.
      </p>
      <a
        href="/sign-in"
        className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Get started
      </a>
    </main>
  );
}
