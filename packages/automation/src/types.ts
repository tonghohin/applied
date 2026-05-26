import type { platformEnum } from "@repo/db";
import type { LocationEntry } from "@repo/shared";

export type Platform = (typeof platformEnum.enumValues)[number];

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  platform: Platform;
  listedAt: string;
}

export interface SearchCriteria {
  jobTitles: string[];
  locations: LocationEntry[];
}
