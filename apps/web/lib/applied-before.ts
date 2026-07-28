export function formatAppliedBeforeText(appliedCount: number): string | null {
  if (appliedCount === 0) return null;
  return `Applied here ${appliedCount === 1 ? "once" : `${appliedCount}x`} before`;
}
