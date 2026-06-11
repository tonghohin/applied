export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toTitleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isExcluded(title: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    new RegExp(`(?<![a-zA-Z0-9_])${escapeRegExp(keyword)}(?![a-zA-Z0-9_])`, "i").test(title)
  );
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
