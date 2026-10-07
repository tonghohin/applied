import { describe, expect, it } from "vitest";
import { stripCodeFences } from "./strip-code-fences";

describe("stripCodeFences", () => {
  it("unwraps a fenced markdown answer", () => {
    expect(stripCodeFences("```markdown\n# Jane\n- Bullet\n```")).toBe("# Jane\n- Bullet");
  });

  it("unwraps a fence without a language", () => {
    expect(stripCodeFences("  ```\nDear Hiring Manager,\n```  ")).toBe("Dear Hiring Manager,");
  });

  it("leaves unfenced text as-is apart from trimming", () => {
    expect(stripCodeFences("\n# Jane\n")).toBe("# Jane");
  });
});
