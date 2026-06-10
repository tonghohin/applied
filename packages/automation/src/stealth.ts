import type { Browser, BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

export const stealthContextOptions: BrowserContextOptions = {
  viewport: { width: 1280, height: 800 },
  timezoneId: "America/Toronto",
  locale: "en-US",
};

export const stealthPatch = () => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  Object.defineProperty(navigator, "plugins", { get: () => ({ length: 3 }) });
  if (!("chrome" in window)) {
    (window as unknown as Record<string, unknown>).chrome = {
      runtime: {},
      app: { isInstalled: false },
    };
  }
};

export async function launchStealthBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
  });
}
