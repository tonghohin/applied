type ProfileReadiness = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  address?: string | null;
  resume?: string | null;
  linkedinEmail?: string | null;
  linkedinPasswordEncrypted?: string | null;
};

type CriteriaReadiness = {
  jobTitles?: string[] | null;
  skills?: string[] | null;
  locations?: unknown[] | null;
};

export function getMissingSearchFields(
  profile: ProfileReadiness | null | undefined,
  criteria: CriteriaReadiness | null | undefined,
): string[] {
  const checks: [unknown, string][] = [
    [profile?.firstName, "First name"],
    [profile?.lastName, "Last name"],
    [profile?.phone, "Phone"],
    [profile?.address, "Address"],
    [profile?.resume, "Resume"],
    [profile?.linkedinEmail, "LinkedIn email"],
    [profile?.linkedinPasswordEncrypted, "LinkedIn password"],
    [criteria?.jobTitles?.length, "Job titles"],
    [criteria?.skills?.length, "Skills"],
    [criteria?.locations?.length, "Locations"],
  ];
  return checks.filter(([value]) => !value).map(([, label]) => label);
}
