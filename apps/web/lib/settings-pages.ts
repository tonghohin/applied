import type { SearchSetupSection } from "@repo/shared";

// Every settings page, in sidebar order. Keys cover each SearchSetupSection so the
// setup empty state can link straight to the page where a missing field is edited.
export const SETTINGS_PAGES = {
  personal: { href: "/settings/personal", label: "Personal info" },
  security: { href: "/settings/security", label: "Security" },
  documents: { href: "/settings/documents", label: "Documents" },
  "job-search": { href: "/settings/job-search", label: "Job search" },
  linkedin: { href: "/settings/linkedin", label: "LinkedIn account" },
  ai: { href: "/settings/ai", label: "AI provider" },
} as const satisfies Record<SearchSetupSection | "security", { href: string; label: string }>;
