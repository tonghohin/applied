export const WORK_TYPES = ["on-site", "remote", "hybrid"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export interface LocationEntry {
  location: string;
  workTypes: WorkType[];
}
