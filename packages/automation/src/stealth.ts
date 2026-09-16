import type { Browser, BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

export const stealthContextOptions: BrowserContextOptions = {
  viewport: { width: 1280, height: 800 },
  timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

// Real Google Chrome (better stealth than bundled Chromium). Falls back to
// Chromium automatically below if Chrome isn't installed (no Linux/arm64 build).
const STEALTH_CHANNEL = "chrome";

const STEALTH_LAUNCH_ARGS = ["--disable-blink-features=AutomationControlled"];

function isMissingBrowserError(error: unknown): boolean {
  return error instanceof Error && /distribution '.*' is not found/i.test(error.message);
}

export async function launchStealthBrowser(): Promise<Browser> {
  const args = STEALTH_LAUNCH_ARGS;
  try {
    return await chromium.launch({ headless: false, channel: STEALTH_CHANNEL, args });
  } catch (error) {
    if (!isMissingBrowserError(error)) throw error;
    console.warn(
      `[stealth] "${STEALTH_CHANNEL}" channel unavailable, falling back to bundled Chromium`
    );
    return chromium.launch({ headless: false, args });
  }
}
