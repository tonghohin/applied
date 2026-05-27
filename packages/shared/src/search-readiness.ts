type ProfileReadiness = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  address?: string | null;
  resume?: string | null;
};

type CriteriaReadiness = {
  jobTitle?: string | null;
  skills?: string[] | null;
  locations?: unknown[] | null;
};

type LinkedInAccountReadiness =
  | {
      email?: string | null;
      passwordEncrypted?: string | null;
    }
  | null
  | undefined;

export function getMissingSearchFields(
  profile: ProfileReadiness | null | undefined,
  criteria: CriteriaReadiness | null | undefined,
  linkedinAccount: LinkedInAccountReadiness = null
): string[] {
  const checks: [unknown, string][] = [
    [profile?.firstName, "First name"],
    [profile?.lastName, "Last name"],
    [profile?.phone, "Phone"],
    [profile?.address, "Address"],
    [profile?.resume, "Resume"],
    [linkedinAccount?.email, "LinkedIn email"],
    [linkedinAccount?.passwordEncrypted, "LinkedIn password"],
    [criteria?.jobTitle, "Job title"],
    [criteria?.skills?.length, "Skills"],
    [criteria?.locations?.length, "Locations"],
  ];
  return checks.filter(([value]) => !value).map(([, label]) => label);
}
