import { Separator } from "@/components/ui/separator";

export function PageLayout({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex h-12 items-center justify-between px-4">
        <h1 className="font-semibold">{title}</h1>
        {action}
      </div>
      <Separator />
      <div className="mx-auto w-full max-w-7xl px-6 py-4">{children}</div>
    </>
  );
}
