import { createMCPClient } from "@ai-sdk/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createConnection } from "@playwright/mcp";
import { launchStealthBrowser, stealthContextOptions, stealthPatch } from "@repo/automation";
import type { BrowserContext, BrowserContextOptions } from "playwright";

type StorageState = NonNullable<BrowserContextOptions["storageState"]>;
type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

export type PlaywrightMCPClient = {
  tools: MCPClient["tools"];
  close: () => Promise<void>;
  browserContext: BrowserContext;
};

export async function createPlaywrightMCPClient(
  storageStateJson?: string
): Promise<PlaywrightMCPClient> {
  const browser = await launchStealthBrowser();

  try {
    const contextOptions: BrowserContextOptions = { ...stealthContextOptions };
    if (storageStateJson) {
      contextOptions.storageState = JSON.parse(storageStateJson) as StorageState;
    }

    const context = await browser.newContext(contextOptions);
    await context.addInitScript(stealthPatch);

    // playwright-extra types reference playwright-core directly; pnpm resolves that to
    // 1.60.0 while @playwright/mcp uses 1.61-alpha. The types are identical at runtime.
    type ContextFactory = Parameters<typeof createConnection>[1];
    const contextFactory = (() => Promise.resolve(context)) as unknown as ContextFactory;
    const mcpServer = await createConnection(
      { imageResponses: "omit", allowUnrestrictedFileAccess: true },
      contextFactory
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
      browserContext: context,
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}
