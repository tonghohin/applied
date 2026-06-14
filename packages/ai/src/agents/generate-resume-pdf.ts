import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marked } from "marked";
import { chromium } from "playwright";

export async function generateResumePdf(resumeText: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "resume-"));
  const pdfPath = join(dir, "resume.pdf");

  const body = await marked.parse(resumeText);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #111;
    padding: 0.6in 0.75in;
  }

  /* Name — first h1 */
  h1 {
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin-bottom: 2px;
  }

  /* Section headings — h2 */
  h2 {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1.5px solid #111;
    padding-bottom: 2px;
    margin-top: 14px;
    margin-bottom: 6px;
  }

  /* Job / project titles — h3 */
  h3 {
    font-size: 10pt;
    font-weight: 600;
    margin-top: 8px;
    margin-bottom: 1px;
  }

  p {
    margin-bottom: 4px;
  }

  ul {
    padding-left: 18px;
    margin-bottom: 4px;
  }

  li {
    margin-bottom: 2px;
  }

  a {
    color: #111;
    text-decoration: none;
  }

  strong { font-weight: 600; }
  em { font-style: italic; }
</style>
</head>
<body>${body}</body>
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
