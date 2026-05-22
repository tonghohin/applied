import type { Page } from "playwright";

export async function loginToLinkedIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("https://www.linkedin.com/login");
  await page.fill("#username", email);
  await page.fill("#password", password);
  await page.click('[type="submit"]');

  try {
    await page.waitForURL("**/feed**", { timeout: 10000 });
  } catch {
    const url = page.url();
    if (url.includes("checkpoint") || url.includes("captcha") || url.includes("challenge")) {
      throw new Error("LinkedIn login blocked: CAPTCHA or security challenge detected");
    }
    throw new Error("LinkedIn login failed: did not reach feed after sign-in");
  }
}
