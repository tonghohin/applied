export const NOTICE_PERIODS = ["immediately", "1_week", "2_weeks", "3_weeks", "4_weeks"] as const;
export type NoticePeriod = (typeof NOTICE_PERIODS)[number];
