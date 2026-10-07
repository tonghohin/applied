import { type Token, marked } from "marked";

/**
 * A stretch of text with a single style. A line of resume text becomes a list of runs, e.g.
 * `Built **fast** APIs` → "Built " (plain), "fast" (bold), " APIs" (plain).
 */
export type InlineRun = { text: string; bold: boolean; italic: boolean; href?: string };

/**
 * One layout block of a resume, in reading order. The PDF renderer styles each type:
 * - `name`: `#` heading, the applicant's name
 * - `heading`: `##` section heading (Summary, Experience, Skills…)
 * - `subheading`: `###` and deeper, a role or degree line
 * - `paragraph`: any other text, including plain-text resumes line by line
 * - `bullets`: a list, with nested items flattened to one level
 */
export type ResumeBlock =
  | { type: "name"; runs: InlineRun[] }
  | { type: "heading"; runs: InlineRun[] }
  | { type: "subheading"; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "bullets"; items: InlineRun[][] };

type InlineStyle = { bold: boolean; italic: boolean; href?: string };

const PLAIN: InlineStyle = { bold: false, italic: false };

/** The token's nested inline tokens, or none (not every marked token type has them). */
function childTokens(token: Token): Token[] {
  return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
}

/** The token's raw text, or an empty string (not every marked token type has text). */
function tokenText(token: Token): string {
  return "text" in token && typeof token.text === "string" ? token.text : "";
}

/** An unstyled run. */
function plainRun(text: string): InlineRun {
  return { text, ...PLAIN };
}

/**
 * Flattens marked's inline tokens into styled runs. Bold, italic and link styles accumulate as it
 * recurses, so `**[site](url)**` becomes one bold run with an href.
 */
function toInlineRuns(tokens: Token[] | undefined, style: InlineStyle = PLAIN): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
        runs.push(...toInlineRuns(token.tokens, { ...style, bold: true }));
        break;
      case "em":
        runs.push(...toInlineRuns(token.tokens, { ...style, italic: true }));
        break;
      case "link": {
        const href: string = token.href;
        runs.push(...toInlineRuns(token.tokens, { ...style, href }));
        break;
      }
      case "br":
        runs.push({ text: "\n", ...style });
        break;
      // Inline HTML tags carry no text of their own — the text between them arrives as text tokens
      case "html":
        break;
      default: {
        const children = childTokens(token);
        const text = tokenText(token);
        if (children.length > 0) {
          runs.push(...toInlineRuns(children, style));
        } else if (text.length > 0) {
          runs.push({ text, ...style });
        }
      }
    }
  }
  return runs;
}

/**
 * Converts one list item into its own runs plus the runs of every item nested under it (at any
 * depth), so the caller can flatten the list to a single bullet level.
 */
function listItemRuns(tokens: Token[]): { runs: InlineRun[]; nested: InlineRun[][] } {
  const runs: InlineRun[] = [];
  const nested: InlineRun[][] = [];
  for (const token of tokens) {
    if (token.type === "list") {
      const items: Token[] = token.items;
      for (const item of items) {
        const child = listItemRuns(childTokens(item));
        nested.push(child.runs, ...child.nested);
      }
    } else if (token.type === "text" || token.type === "paragraph") {
      if (runs.length > 0) runs.push(plainRun(" "));
      runs.push(...toInlineRuns(token.tokens ?? [], PLAIN));
    } else {
      runs.push(...toInlineRuns([token]));
    }
  }
  return { runs, nested };
}

/** Maps a markdown heading level to its resume role: `#` name, `##` section, deeper a role line. */
function headingBlockType(depth: number): "name" | "heading" | "subheading" {
  if (depth === 1) return "name";
  if (depth === 2) return "heading";
  return "subheading";
}

/**
 * Converts marked's block tokens into resume blocks. Nothing with text is dropped: blockquotes are
 * unwrapped, table rows become "a | b" paragraphs, and code or HTML become plain paragraphs.
 */
function toBlocks(tokens: Token[]): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const depth: number = token.depth;
        blocks.push({ type: headingBlockType(depth), runs: toInlineRuns(token.tokens) });
        break;
      }
      case "paragraph":
        blocks.push({ type: "paragraph", runs: toInlineRuns(token.tokens) });
        break;
      case "list": {
        const listItems: Token[] = token.items;
        // Nested lists are flattened to one level — ATS parsers handle a single bullet level best
        const items = listItems.flatMap((item) => {
          const { runs, nested } = listItemRuns(childTokens(item));
          return [runs, ...nested];
        });
        blocks.push({ type: "bullets", items: items.filter((runs) => runs.length > 0) });
        break;
      }
      case "blockquote":
        blocks.push(...toBlocks(token.tokens ?? []));
        break;
      case "table": {
        const header: { text: string }[] = token.header;
        const rows: { text: string }[][] = token.rows;
        for (const row of [header, ...rows]) {
          blocks.push({
            type: "paragraph",
            runs: [plainRun(row.map((cell) => cell.text).join(" | "))],
          });
        }
        break;
      }
      case "space":
      case "hr":
      case "def":
        break;
      default: {
        // code, html and anything else: keep the text rather than silently dropping content
        const text = tokenText(token)
          .replace(/<[^>]+>/g, "")
          .trim();
        if (text) blocks.push({ type: "paragraph", runs: [plainRun(text)] });
      }
    }
  }
  return blocks;
}

/**
 * Parses resume text into layout blocks for the PDF renderer.
 *
 * Accepts the tailored resume's markdown (`#` name, `##` sections, `###` roles, `-` bullets) as
 * well as plain text. Single newlines are kept as line breaks (marked's `breaks` option), so a
 * resume pasted from a PDF or Word file keeps its line structure.
 */
export function parseResumeMarkdown(markdown: string): ResumeBlock[] {
  return toBlocks(marked.lexer(markdown, { ...marked.defaults, breaks: true }));
}
