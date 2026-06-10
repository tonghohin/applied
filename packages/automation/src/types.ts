import type { platformEnum } from "@repo/db";
import type { LocationEntry, WorkType } from "@repo/shared";

export type Platform = (typeof platformEnum.enumValues)[number];

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  externalApplyUrl: string | null;
  workplaceType: WorkType;
  platform: Platform;
  listedAt: string;
}

export interface SearchCriteria {
  jobTitle: string;
  locations: LocationEntry[];
  excludeKeywords: string[];
}
