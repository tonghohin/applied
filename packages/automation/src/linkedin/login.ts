import type { Page } from "playwright";

export async function loginToLinkedIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("https://www.linkedin.com/login", { waitUntil: "load" });

  const url = page.url();
  if (url.includes("checkpoint") || url.includes("captcha") || url.includes("challenge")) {
    throw new Error("LinkedIn login blocked: CAPTCHA or security challenge detected before login form");
  }

  const emailInput = page.locator('input[type="email"]:visible').first();

  const ready = await emailInput.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
  if (!ready) {
    const screenshot = await page.screenshot({ type: "png" });
    const fs = await import("node:fs/promises");
    const path = `/tmp/linkedin-login-failure-${Date.now()}.png`;
    await fs.writeFile(path, screenshot);
    throw new Error(`LinkedIn login page did not show the email field (current URL: ${url}, screenshot: ${path})`);
  }

  await emailInput.fill(email);
  const passwordInput = page.locator('input[type="password"]:visible').first();
  await passwordInput.fill(password);
  await passwordInput.press("Enter");

  try {
    await page.waitForURL("**/feed**", { timeout: 10000 });
  } catch {
    const currentUrl = page.url();
    if (currentUrl.includes("checkpoint") || currentUrl.includes("captcha") || currentUrl.includes("challenge")) {
      throw new Error("LinkedIn login blocked: CAPTCHA or security challenge detected");
    }
    throw new Error("LinkedIn login failed: did not reach feed after sign-in");
  }
}
