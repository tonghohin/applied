import { describe, expect, it } from "vitest";
import { contactLinesFor } from "./contact-lines";

describe("contactLinesFor", () => {
  it("lists contact details in a fixed order and skips missing ones", () => {
    expect(
      contactLinesFor({
        email: "jane@example.com",
        phone: "555-0100",
        address: "",
        linkedinUrl: "https://linkedin.com/in/jane",
        githubUrl: null,
        websiteUrl: "https://jane.dev",
      })
    ).toEqual(["jane@example.com", "555-0100", "https://linkedin.com/in/jane", "https://jane.dev"]);
  });
});
