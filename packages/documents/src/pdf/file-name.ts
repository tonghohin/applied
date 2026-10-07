import type { TailoredDocumentKind } from "@repo/shared";

const KIND_LABELS: Record<TailoredDocumentKind, string> = {
  resume: "Resume",
  cover_letter: "Cover Letter",
};

function cleanFileNamePart(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s&.-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
}

// e.g. "Jane Doe - Resume - Acme.pdf". The company (not the role — titles are long and noisy)
// keeps downloads for different jobs apart, and reads as deliberate to the employer.
export function documentFileName({
  applicantName,
  kind,
  company,
}: {
  applicantName: string;
  kind: TailoredDocumentKind;
  company: string;
}): string {
  const parts = [cleanFileNamePart(applicantName), KIND_LABELS[kind], cleanFileNamePart(company)];
  return `${parts.filter(Boolean).join(" - ")}.pdf`;
}
