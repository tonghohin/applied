function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isExcluded(title: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    new RegExp(`(?<![a-zA-Z0-9_])${escapeRegExp(keyword)}(?![a-zA-Z0-9_])`, "i").test(title)
  );
}
