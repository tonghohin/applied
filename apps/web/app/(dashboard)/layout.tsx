import { Footer } from "@/components/footer";
import { AppSidebar } from "@/components/nav/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {children}
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  );
}
