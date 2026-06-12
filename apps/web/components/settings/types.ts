import type { NoticePeriod } from "@repo/shared";

export type InitialProfile = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  resume?: string;
  coverLetterInstructions?: string | null;
  requiresSponsorship?: boolean;
  noticePeriod?: NoticePeriod;
} | null;
