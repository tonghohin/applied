import { Footer } from "@/components/footer";
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
        <div className="flex-1 p-4 pt-2">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  );
}
