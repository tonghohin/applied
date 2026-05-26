import { createMCPClient } from "@ai-sdk/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createConnection } from "@playwright/mcp";
import type { BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
];

type StorageState = NonNullable<BrowserContextOptions["storageState"]>;
type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

export async function createPlaywrightMCPClient(storageStateJson?: string): Promise<MCPClient> {
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });

  const contextOptions: BrowserContextOptions = {
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
  };
  if (storageStateJson) {
    contextOptions.storageState = JSON.parse(storageStateJson) as StorageState;
  }

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const mcpServer = await createConnection(
    {},
    () => Promise.resolve(context as Parameters<typeof createConnection>[1] extends ((...args: infer A) => unknown) ? Awaited<ReturnType<(...args: A) => unknown>> : never),
  );

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);

  const client = await createMCPClient({ transport: clientTransport });

  const origClose = client.close.bind(client);
  Object.defineProperty(client, "close", {
    value: async () => {
      await origClose();
      await context.close();
      await browser.close();
    },
    writable: true,
    configurable: true,
  });

  return client;
}
