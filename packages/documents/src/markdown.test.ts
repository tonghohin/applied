import { describe, expect, it } from "vitest";
import { parseResumeMarkdown } from "./markdown";

describe("parseResumeMarkdown", () => {
  it("maps heading levels to name, section heading and subheading", () => {
    const blocks = parseResumeMarkdown("# Jane Doe\n\n## Experience\n\n### Engineer — Acme");

    expect(blocks.map((block) => block.type)).toEqual(["name", "heading", "subheading"]);
    expect(blocks[0]).toEqual({
      type: "name",
      runs: [{ text: "Jane Doe", bold: false, italic: false }],
    });
  });

  it("keeps bold, italic and link styling as inline runs", () => {
    const [block] = parseResumeMarkdown(
      "Built **fast** APIs with *care* — [site](https://example.com)"
    );

    expect(block).toEqual({
      type: "paragraph",
      runs: [
        { text: "Built ", bold: false, italic: false },
        { text: "fast", bold: true, italic: false },
        { text: " APIs with ", bold: false, italic: false },
        { text: "care", bold: false, italic: true },
        { text: " — ", bold: false, italic: false },
        { text: "site", bold: false, italic: false, href: "https://example.com" },
      ],
    });
  });

  it("keeps ampersands and other characters unescaped", () => {
    const [block] = parseResumeMarkdown("R&D at AT&T");

    expect(block?.type === "paragraph" && block.runs[0]?.text).toBe("R&D at AT&T");
  });

  it("flattens nested list items into a single bullet level", () => {
    const [block] = parseResumeMarkdown("- First\n  - Nested\n- Second");

    expect(block?.type).toBe("bullets");
    const texts =
      block?.type === "bullets"
        ? block.items.map((runs) => runs.map((run) => run.text).join(""))
        : [];
    expect(texts).toEqual(["First", "Nested", "Second"]);
  });

  it("degrades tables and code blocks to paragraphs instead of dropping them", () => {
    const blocks = parseResumeMarkdown(
      "| Skill | Years |\n|---|---|\n| Go | 3 |\n\n```\nconst x = 1\n```"
    );

    const texts = blocks.map((block) =>
      block.type === "paragraph" ? block.runs.map((run) => run.text).join("") : block.type
    );
    expect(texts).toEqual(["Skill | Years", "Go | 3", "const x = 1"]);
  });

  it("drops inline HTML tags but keeps their text", () => {
    const [block] = parseResumeMarkdown("Hello <b>world</b>");

    const text = block?.type === "paragraph" ? block.runs.map((run) => run.text).join("") : "";
    expect(text).toBe("Hello world");
  });

  it("keeps single line breaks from plain-text resumes", () => {
    const [block] = parseResumeMarkdown("Jane Doe\njane@example.com\nToronto");

    const text = block?.type === "paragraph" ? block.runs.map((run) => run.text).join("") : "";
    expect(text).toBe("Jane Doe\njane@example.com\nToronto");
  });

  it("ignores horizontal rules and blank space", () => {
    expect(parseResumeMarkdown("---\n\n\n")).toEqual([]);
  });
});
