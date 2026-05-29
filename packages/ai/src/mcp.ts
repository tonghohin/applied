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

  try {
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

    // playwright-extra types reference playwright-core directly; pnpm resolves that to
    // 1.60.0 while @playwright/mcp uses 1.61-alpha. The types are identical at runtime.
    // biome-ignore lint/suspicious/noExplicitAny: playwright-core version mismatch between playwright-extra and @playwright/mcp
    const mcpServer = await (createConnection as any)(
      { imageResponses: "omit", allowUnrestrictedFileAccess: true },
      () => Promise.resolve(context)
    );

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = await createMCPClient({ transport: clientTransport });

    return {
      tools: () => client.tools(),
      close: async () => {
        await client.close();
        await context.close();
        await browser.close();
      },
    } as unknown as MCPClient;
  } catch (err) {
    await browser.close();
    throw err;
  }
}
