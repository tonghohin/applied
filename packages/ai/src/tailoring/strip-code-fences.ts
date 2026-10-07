const FENCED_BLOCK = /^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n\s*```\s*$/;

// LLMs sometimes wrap the whole answer in a ```markdown fence despite being told not to
export function stripCodeFences(text: string): string {
  const match = text.trim().match(FENCED_BLOCK);
  return (match?.[1] ?? text).trim();
}
