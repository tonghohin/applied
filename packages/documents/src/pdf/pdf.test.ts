import { describe, expect, it } from "vitest";
import { renderCoverLetterPdf, splitParagraphs } from "./cover-letter-pdf";
import { documentFileName } from "./file-name";
import { renderResumePdf } from "./resume-pdf";

describe("renderResumePdf", () => {
  it("renders a PDF buffer", async () => {
    const pdf = await renderResumePdf({
      markdown: "# Jane Doe\njane@example.com\n\n## Skills\nTypeScript, Go\n\n- Built things",
      applicantName: "Jane Doe",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("renderResumePdf with non-Latin text", () => {
  it("renders bold and italic runs with Greek, Cyrillic and unsupported characters", async () => {
    const pdf = await renderResumePdf({
      markdown: "# Jöse Ωmega\n\n*Kubernetes → cloud* and **≥ 6 years ✓** — Привет 中文",
      applicantName: "Jöse Ωmega",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("renderCoverLetterPdf", () => {
  it("renders a PDF buffer", async () => {
    const pdf = await renderCoverLetterPdf({
      body: "Dear Hiring Manager,\n\nI am excited.\n\nSincerely,\nJane Doe",
      applicantName: "Jane Doe",
      date: new Date(2026, 0, 15),
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and keeps single line breaks inside a paragraph", () => {
    expect(splitParagraphs("Dear Hiring Manager,\n\n  \nBody.\n\nSincerely,\nJane\n")).toEqual([
      "Dear Hiring Manager,",
      "Body.",
      "Sincerely,\nJane",
    ]);
  });
});

describe("documentFileName", () => {
  it("names the file after the applicant, document kind and company", () => {
    expect(documentFileName({ applicantName: "Jane Doe", kind: "resume", company: "Acme" })).toBe(
      "Jane Doe - Resume - Acme.pdf"
    );
    expect(
      documentFileName({ applicantName: "Jane Doe", kind: "cover_letter", company: "Acme" })
    ).toBe("Jane Doe - Cover Letter - Acme.pdf");
  });

  it("strips characters that are unsafe in file names but keeps common company punctuation", () => {
    expect(
      documentFileName({
        applicantName: "  Jane / O'Doe:  ",
        kind: "resume",
        company: 'AT&T Inc. / "Mobility"',
      })
    ).toBe("Jane ODoe - Resume - AT&T Inc. Mobility.pdf");
  });

  it("keeps non-latin letters", () => {
    expect(
      documentFileName({ applicantName: "José Núñez", kind: "resume", company: "Café Ltd" })
    ).toBe("José Núñez - Resume - Café Ltd.pdf");
  });

  it("leaves out an empty name or company", () => {
    expect(documentFileName({ applicantName: "Jane Doe", kind: "resume", company: "" })).toBe(
      "Jane Doe - Resume.pdf"
    );
    expect(documentFileName({ applicantName: "  ", kind: "cover_letter", company: "Acme" })).toBe(
      "Cover Letter - Acme.pdf"
    );
    expect(documentFileName({ applicantName: "", kind: "resume", company: "" })).toBe("Resume.pdf");
  });
});
