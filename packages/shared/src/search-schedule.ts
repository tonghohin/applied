export interface SearchScheduleConfig {
  enabled: boolean;
  intervalHours: number;
  startHour: number;
  endHour: number;
  days: number[];
  timezone: string;
}

// No timezone here — it is always browser-detected or user-chosen, never hardcoded.
export const SEARCH_SCHEDULE_DEFAULTS = {
  enabled: false,
  intervalHours: 2,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
} as const;

export function buildSearchCronPattern(config: {
  intervalHours: number;
  startHour: number;
  endHour: number;
  days: readonly number[];
}): string {
  const days = [...new Set(config.days)].sort((left, right) => left - right).join(",");
  const hours =
    config.startHour === config.endHour
      ? `${config.startHour}`
      : `${config.startHour}-${config.endHour}/${config.intervalHours}`;
  return `0 ${hours} * * ${days}`;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
