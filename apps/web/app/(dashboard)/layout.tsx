import { SseProvider } from "@/components/sse-provider";
import { AppSidebar } from "@/components/nav/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SseProvider>
          <div className="flex flex-1 flex-col">{children}</div>
        </SseProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
