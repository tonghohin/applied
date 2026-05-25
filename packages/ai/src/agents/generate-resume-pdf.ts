import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

export async function generateResumePdf(resumeText: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "resume-"));
  const pdfPath = join(dir, "resume.pdf");

  const escaped = resumeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    margin: 0.75in;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
</head>
<body>${escaped}</body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: pdfPath, format: "Letter", printBackground: false });
  } finally {
    await browser.close();
  }

  return pdfPath;
}
