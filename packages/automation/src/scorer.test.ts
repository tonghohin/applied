import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  fitTierEnum: { enumValues: ["strong", "potential", "weak"] },
  platformEnum: { enumValues: ["linkedin"] },
}));
import { scoreJob } from "./scorer";
import type { ScrapedJob } from "./types";

function makeJob(title: string, description: string): ScrapedJob {
  return {
    title,
    description,
    company: "ACME",
    location: "Remote",
    url: "https://example.com",
    externalApplyUrl: null,
    platform: "linkedin",
    workplaceType: "on-site",
    listedAt: new Date().toISOString(),
  };
}

const criteria = {
  jobTitle: "Software Engineer",
  skills: ["TypeScript", "React", "Node.js", "GraphQL", "PostgreSQL", "Docker"],
};

describe("scoreJob", () => {
  it("returns strong when title + 5 skills match (score ≥7)", () => {
    // title match = 2pts, 5 skill matches = 5pts → score 7
    const job = makeJob(
      "Senior Software Engineer",
      "We use TypeScript, React, Node.js, GraphQL, and PostgreSQL every day."
    );
    expect(scoreJob(job, criteria)).toBe("strong");
  });

  it("returns potential when title + 1 skill match (score 3)", () => {
    // title match = 2pts, 1 skill = 1pt → score 3
    const job = makeJob("Software Engineer", "Looking for someone with TypeScript experience.");
    expect(scoreJob(job, criteria)).toBe("potential");
  });

  it("returns weak when no title or skill match (score 0)", () => {
    const job = makeJob(
      "Marketing Manager",
      "Drive brand awareness and lead generation campaigns."
    );
    expect(scoreJob(job, criteria)).toBe("weak");
  });

  it("returns weak when criteria is empty", () => {
    const job = makeJob("Software Engineer", "TypeScript React Node.js");
    expect(scoreJob(job, { jobTitle: "", skills: [] })).toBe("weak");
  });

  it("caps score at strong tier regardless of many skill matches", () => {
    const job = makeJob(
      "Software Engineer",
      "TypeScript React Node.js GraphQL PostgreSQL Docker TypeScript React"
    );
    expect(scoreJob(job, criteria)).toBe("strong");
  });
});
