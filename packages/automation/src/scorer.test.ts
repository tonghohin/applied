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
    platform: "linkedin",
    workplaceType: "on-site",
  };
}

const skills = ["TypeScript", "React", "Node.js", "GraphQL", "PostgreSQL", "Docker"];

describe("scoreJob", () => {
  it("returns strong when 5 of 6 skills match (meets proportional threshold)", () => {
    const job = makeJob(
      "Frontend Developer",
      "We use TypeScript, React, Node.js, GraphQL, and PostgreSQL every day."
    );
    expect(scoreJob(job, skills)).toBe("strong");
  });

  it("returns potential when 2 skills match", () => {
    const job = makeJob("Software Developer", "Looking for TypeScript and React experience.");
    expect(scoreJob(job, skills)).toBe("potential");
  });

  it("returns weak when no skills match", () => {
    const job = makeJob(
      "Marketing Manager",
      "Drive brand awareness and lead generation campaigns."
    );
    expect(scoreJob(job, skills)).toBe("weak");
  });

  it("returns weak when skills list is empty", () => {
    const job = makeJob("Software Engineer", "TypeScript React Node.js");
    expect(scoreJob(job, [])).toBe("weak");
  });

  it("caps score at strong tier regardless of many skill matches", () => {
    const job = makeJob(
      "Engineer",
      "TypeScript React Node.js GraphQL PostgreSQL Docker TypeScript React"
    );
    expect(scoreJob(job, skills)).toBe("strong");
  });

  it("does not match skill substrings without word boundary", () => {
    const job = makeJob("Reactive Systems Engineer", "We build reactive pipelines with nodejs.");
    expect(scoreJob(job, ["React", "Node.js"])).toBe("weak");
  });

  it("strong threshold scales down with fewer skills", () => {
    // 3 skills saved → strongThreshold = max(2, min(3,6)-1) = 2
    const job = makeJob("Developer", "We use TypeScript and React.");
    expect(scoreJob(job, ["TypeScript", "React", "Node.js"])).toBe("strong");
  });
});
