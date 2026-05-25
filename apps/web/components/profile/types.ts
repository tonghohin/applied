export type InitialProfile = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  resumeMarkdown?: string;
  coverLetterMarkdown?: string;
} | null;
