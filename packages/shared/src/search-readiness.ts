type ProfileReadiness = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  address?: string | null;
  resume?: string | null;
  aiGatewayKeyEncrypted?: string | null;
};

type CriteriaReadiness = {
  jobTitle?: string | null;
  locations?: unknown[] | null;
};

type LinkedInAccountReadiness =
  | {
      email?: string | null;
      passwordEncrypted?: string | null;
    }
  | null
  | undefined;

export const SEARCH_SETUP_SECTIONS = [
  "personal",
  "documents",
  "job-search",
  "linkedin",
  "ai",
] as const;

export type SearchSetupSection = (typeof SEARCH_SETUP_SECTIONS)[number];

export type MissingSearchField = { label: string; section: SearchSetupSection };

export function getMissingSearchSetup(
  profile: ProfileReadiness | null | undefined,
  criteria: CriteriaReadiness | null | undefined,
  linkedinAccount: LinkedInAccountReadiness = null
): MissingSearchField[] {
  // Fields required before a search can run, grouped by the settings section they're edited in.
  const requirements: Record<SearchSetupSection, Record<string, unknown>> = {
    personal: {
      "First name": profile?.firstName,
      "Last name": profile?.lastName,
      Phone: profile?.phone,
      Address: profile?.address,
    },
    documents: { Resume: profile?.resume },
    "job-search": { "Job title": criteria?.jobTitle, Locations: criteria?.locations?.length },
    linkedin: {
      "LinkedIn email": linkedinAccount?.email,
      "LinkedIn password": linkedinAccount?.passwordEncrypted,
    },
    ai: { "AI Gateway key": profile?.aiGatewayKeyEncrypted },
  };

  return SEARCH_SETUP_SECTIONS.flatMap((section) =>
    Object.entries(requirements[section])
      .filter(([, value]) => !value)
      .map(([label]) => ({ label, section }))
  );
}

export function getMissingSearchFields(
  profile: ProfileReadiness | null | undefined,
  criteria: CriteriaReadiness | null | undefined,
  linkedinAccount: LinkedInAccountReadiness = null
): string[] {
  return getMissingSearchSetup(profile, criteria, linkedinAccount).map((field) => field.label);
}
