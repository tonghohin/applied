import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function PageLayout({
  title,
  section,
  action,
  children,
}: {
  title: string;
  section?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          {section ? (
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>{section}</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <BreadcrumbPage className="text-sm">{title}</BreadcrumbPage>
          )}
        </div>
        {action}
      </div>
      <div className="w-full px-6 py-4">{children}</div>
    </>
  );
}
