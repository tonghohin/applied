import type { platformEnum } from "@repo/db";

export type Platform = (typeof platformEnum.enumValues)[number];

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  platform: Platform;
}

export interface SearchCriteria {
  jobTitles: string[];
  locations: string[];
  remote: boolean;
}
