export const TAILORED_DOCUMENT_KINDS = ["resume", "cover_letter"] as const;
export type TailoredDocumentKind = (typeof TAILORED_DOCUMENT_KINDS)[number];
