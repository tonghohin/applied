import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <h1 className="font-semibold">{title}</h1>
        </div>
        {action}
      </div>
      <Separator />
      <div className="mx-auto w-full max-w-7xl px-6 py-4">{children}</div>
    </>
  );
}
