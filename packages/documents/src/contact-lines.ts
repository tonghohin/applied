export type ContactDetails = {
  email: string;
  phone: string;
  address: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
};

export function contactLinesFor(contact: ContactDetails): string[] {
  return [
    contact.email,
    contact.phone,
    contact.address,
    contact.linkedinUrl,
    contact.githubUrl,
    contact.websiteUrl,
  ].filter((line): line is string => Boolean(line));
}
