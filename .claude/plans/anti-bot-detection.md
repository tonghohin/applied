# Context

The automated job applier is getting applications flagged as spam or blocked by CAPTCHAs. The current anti-bot work is a solid start but has several meaningful gaps. This plan addresses those gaps in priority order — pure-code fixes first, then infra-dependent proxy support last.

---

## What's already working

- `playwright-extra` + `puppeteer-extra-plugin-stealth` on both the scraper and apply agent
- `--disable-blink-features=AutomationControlled` launch arg
- `navigator.webdriver` patched to `undefined` via `addInitScript`
- Random delays between jobs (1.5–3.5s) and locations (5–8s)
- Session reuse via encrypted `storageState` in DB
- CAPTCHA detection with manual-login fallback
- Sequential job processing (concurrency: 1)

---

## Gaps causing current detections

| Gap | Impact | Notes |
|-----|--------|-------|
| `time:1` (1ms) between checkbox clicks in apply prompt | High | Effectively zero delay — triggers rapid-click bot signals |
| Chrome 131 user agent (released Nov 2024) | Medium-high | Current stable is 136; stale UA is a fingerprinting signal |
| `navigator.languages = []` in headless | Medium-high | Real Chrome returns `["en-US","en"]`; detection scripts check this |
| `navigator.plugins.length = 0` in headless | Medium | Real Chrome has 3+ plugins |
| `window.chrome` missing | Medium | Detection scripts check for `chrome.runtime` object |
| No `timezoneId`/`locale` on browser context | Medium | Headless defaults to UTC/no-locale, inconsistent with macOS UA |
| Login fills fields instantaneously | Medium | `fill()` bypasses keyboard events entirely |
| Scroll via JS (`el.scrollTop += 600`) | Medium | No real browser input event — a known bot signal |
| No proxy support | Critical | Running from a developer/server IP; LinkedIn flags these aggressively |

---

## Task 1 — Fix `time:1` in the apply agent prompt

- [x] **File:** `packages/ai/src/agents/apply-agent.ts:49`

Change `time:1` → `time:1500` in `FORM_FILLING_RULES`:

```
// before
When clicking multiple checkboxes or radio buttons in sequence, add a browser_wait_for with time:1 between each click.

// after
When clicking multiple checkboxes or radio buttons in sequence, add a browser_wait_for with time:1500 between each click.
```

`browser_wait_for`'s `time` parameter is milliseconds. 1ms is noise; 1500ms is a realistic inter-click pause.

---

## Task 2 — Update user agent and sec-ch-ua headers to match actual Chromium version

- [x] **Files:**
  - `packages/automation/src/search.ts:28` — `contextOptions.userAgent`
  - `packages/ai/src/mcp.ts:11` — `USER_AGENT` constant

Before hardcoding "136", verify the actual Chromium version bundled with Playwright 1.60 by running `browser.version()` after launch. The UA string must match — LinkedIn checks both `User-Agent` and the `sec-ch-ua` Client Hints header, and a mismatch between them is detectable. The browser sets `sec-ch-ua` based on the *actual* binary version, not the overridden UA string, so they must align.

Update the UA string in both files (substituting the real version if not 136):
```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36
```

- [ ] Also add `extraHTTPHeaders` to both context option objects to explicitly match the UA:
  ```typescript
  extraHTTPHeaders: {
    "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  },
  ```
  Replace `136` with whichever version `browser.version()` reports.

---

## Task 3 — Expand the browser init script (languages, plugins, chrome object) + add locale/timezone

### 3a. Expand `webdriverPatch` / `addInitScript` in both packages

Note: `puppeteer-extra-plugin-stealth` already includes modules for `navigator.languages`, `navigator.plugins`, and `window.chrome`. These patches are intentional belt-and-suspenders — insurance against StealthPlugin's Playwright compatibility gaps (the plugin was designed for Puppeteer and some patches may not apply cleanly via `playwright-extra`).

- [x] **`packages/automation/src/search.ts`**: The `webdriverPatch` function (line 22) is called via `page.addInitScript` in 4 places (lines 40, 56, 70, 109). Expand the function to also patch:
  - `navigator.languages` → `["en-US", "en"]`
  - `navigator.plugins` → fake array with `length: 3`
  - `window.chrome` → `{ runtime: {}, app: { isInstalled: false } }`

  Keep the existing `navigator.webdriver` patch in the same function.

- [x] **`packages/ai/src/mcp.ts`**: The `context.addInitScript` call (line 42) already patches `navigator.webdriver`. Expand it with the same four properties.

Don't share via `@repo/shared` — `packages/ai` doesn't depend on it and the inline function is small.

### 3b. Add `timezoneId` and `locale` to `BrowserContextOptions`

- [x] **`packages/automation/src/search.ts`**: The `ContextOptions` type (line 17–20) is currently narrowed to just `userAgent` and `viewport`. Replace that local type with `BrowserContextOptions` from playwright (it's already imported), then add to the `contextOptions` object:
  ```typescript
  timezoneId: "America/Toronto",
  locale: "en-US",
  ```
  All four `browser.newContext(contextOptions)` call sites spread this object, so they all pick up the new fields automatically — including `manualHeadedLogin`.

- [x] **`packages/ai/src/mcp.ts`**: `contextOptions` at line 33–36 is typed inline as `BrowserContextOptions` already. Add the same two fields.

---

## Task 4 — Human-mimic the login flow

- [x] **File:** `packages/automation/src/linkedin/login.ts`

Replace instantaneous `fill()` calls with `pressSequentially()` (Playwright v1.17+) which dispatches real keyboard events with configurable per-character delay. Also add inter-field pause:

```typescript
// Replace:
await emailInput.fill(email);
const passwordInput = page.locator('input[type="password"]:visible').first();
await passwordInput.fill(password);
await passwordInput.press("Enter");

// With:
await emailInput.pressSequentially(email, { delay: 80 });
await page.waitForTimeout(500 + Math.random() * 700);
const passwordInput = page.locator('input[type="password"]:visible').first();
await passwordInput.pressSequentially(password, { delay: 90 });
await page.waitForTimeout(300 + Math.random() * 400);
await passwordInput.press("Enter");
```

Also add a homepage warm-up before navigating to `/login` — replace the direct `page.goto("/login")` with:

```typescript
await page.goto("https://www.linkedin.com", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500 + Math.random() * 1000);
await page.goto("https://www.linkedin.com/login", { waitUntil: "load" });
```

---

## Task 5 — Replace JS-injection scroll with `mouse.wheel()`

- [x] **File:** `packages/automation/src/linkedin/scraper.ts`, inside `scrapeJobsPage` (lines 71–88)

The current `page.evaluate(() => { el.scrollTop += 600 })` modifies the DOM without any browser input event. Replace with Playwright's `mouse.wheel()` which dispatches real `WheelEvent`:

```typescript
// Replace the entire page.evaluate scroll block with:
await page.mouse.wheel(0, 600);
```

Keep the existing `await page.waitForTimeout(600)` after the scroll — that's fine.

---

## Task 6 — Add feed warm-up after session restore

- [x] **File:** `packages/automation/src/search.ts`, inside `runSearch` — after the session-restore block confirms the feed URL is valid (line 110–115).

After the session is confirmed valid and `page.url().includes("/feed")` is true, add a short warm-up before jumping straight into job search navigation:

```typescript
// After session restore is confirmed valid:
await page.waitForTimeout(1500 + Math.random() * 1500);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(800 + Math.random() * 600);
```

This makes the session look like a real user browsing the feed rather than going directly from login to search.

---

## Task 7 — Add proxy support

Proxy is the single highest-impact fix for IP-based detection. This task wires up Playwright's built-in proxy support behind an optional env var so it works with any residential proxy provider (Brightdata, Oxylabs, Smartproxy, etc.).

### 7a. Add env var to worker

- [x] **File:** `apps/worker/src/env.ts`

Add optional field:
```typescript
LINKEDIN_PROXY_URL: z.string().url().optional(),
```

Format: `http://user:pass@host:port` (standard for Playwright proxy).

### 7b. Thread proxy through the search path

- [x] **`packages/automation/src/search.ts`**:
  - Add `proxyUrl?: string` to `runSearch` signature
  - Add `proxyUrl?: string` to `loginOrManual` signature (it creates contexts at lines 54 and 65 that need the proxy too)
  - In every `browser.newContext(...)` call, spread `...(proxyUrl && { proxy: { server: proxyUrl } })`:
    - Line 54 inside `loginOrManual`: fresh login context
    - Line 65 inside `loginOrManual`: restored context after manual CAPTCHA login
    - Line 104 inside `runSearch`: session-restore context
  - `manualHeadedLogin` does not need proxy — it's the user's headed browser

- [x] **`apps/worker/src/workers/search.worker.ts`**: Pass `env.LINKEDIN_PROXY_URL` as last arg to `runSearch(...)`.

### 7c. Thread proxy through the apply path

- [x] **`packages/ai/src/mcp.ts`**:
  - Add `proxyUrl?: string` to `createPlaywrightMCPClient` signature
  - In `browser.newContext(...)` at line 41, add: `...(proxyUrl && { proxy: { server: proxyUrl } })`

- [x] **`packages/ai/src/agents/apply-agent.ts`**:
  - Add `proxyUrl?: string` to `applyToJob` signature (after `log` param)
  - Pass it to `createPlaywrightMCPClient(linkedinSessionJson, proxyUrl)`

- [x] **`packages/ai/src/agents/process-apply.ts`**:
  - Add `proxyUrl?: string` to `processApplyJob` signature
  - Pass it to `applyToJob(..., proxyUrl)`

- [x] **`apps/worker/src/workers/apply.worker.ts`**: Pass `env.LINKEDIN_PROXY_URL` to `processApplyJob(...)`.

---

## Known limitations

- **Apply agent form typing is instantaneous** — `@playwright/mcp`'s `browser_type` tool calls `locator.fill()` internally, which sets field values without dispatching keyboard events. Every text field in a job application (name, address, resume text, etc.) is filled in ~0ms. This is a behavioral bot signal on LinkedIn Easy Apply pages. There is no clean fix without forking the MCP server — accepted tradeoff. Third-party ATS platforms (Greenhouse, Lever, Ashby) typically have less sophisticated typing-pattern detection than LinkedIn itself.

---

## Verification

1. **time:1 fix**: Trigger an apply run and watch the logs — confirm `browser_wait_for` calls between checkboxes appear with ~1.5s gaps
2. **Fingerprint hardening**: Open a headed browser locally, run `page.evaluate(() => navigator.languages)` and `page.evaluate(() => !!window.chrome)` in DevTools on a context created with the new init script — should return `["en-US","en"]` and `true`
3. **sec-ch-ua headers**: In the same headed session, check the Network tab request headers on a LinkedIn navigation — `sec-ch-ua` should show the same version as the UA string
4. **Login humanization**: Watch login in headed mode (`headless: false`) — should see character-by-character typing with visible pauses
5. **Scroll**: Confirm `scrapeJobsPage` no longer calls `page.evaluate` for scrolling
6. **Feed warm-up**: Confirm the warm-up delay appears in worker logs after "Session restored" and before the first search URL navigation
7. **Proxy**: Set `LINKEDIN_PROXY_URL=http://...` in `apps/worker/.env`, run a search, check the proxy provider's traffic dashboard to confirm requests are flowing through it
8. **Type check**: `pnpm typecheck` passes with no errors after the `ContextOptions` type change in `search.ts`
9. **End-to-end**: Run a full search + apply cycle; success rate for getting past CAPTCHA should improve noticeably

---

## Completed

- **Date:** 2026-06-07
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/ai/src/agents/apply-agent.ts` — `time:1` → `time:1500` between checkbox clicks; added `proxyUrl` param to `applyToJob`
  - `packages/ai/src/agents/process-apply.ts` — added `proxyUrl` param to `processApplyJob`
  - `packages/ai/src/mcp.ts` — UA updated to Chrome 148; expanded init script; added `timezoneId`, `locale`, `sec-ch-ua` headers, proxy support to `createPlaywrightMCPClient`
  - `packages/automation/src/search.ts` — replaced `ContextOptions` type with `BrowserContextOptions`; renamed `webdriverPatch` → `stealthPatch` with expanded patches; added `timezoneId`, `locale`, `sec-ch-ua` headers; proxy threading through `loginOrManual` and `runSearch`; feed warm-up after session restore
  - `packages/automation/src/linkedin/login.ts` — replaced `fill()` with `pressSequentially()` + inter-field delays + homepage warm-up before `/login`
  - `packages/automation/src/linkedin/scraper.ts` — replaced JS-injection scroll with `page.mouse.wheel()`
  - `apps/worker/src/env.ts` — added optional `LINKEDIN_PROXY_URL` env var
  - `apps/worker/src/workers/search.worker.ts` — passes `env.LINKEDIN_PROXY_URL` to `runSearch`
  - `apps/worker/src/workers/apply.worker.ts` — passes `env.LINKEDIN_PROXY_URL` to `processApplyJob`
- **How to test:**
  - `pnpm turbo typecheck` — all green
  - Set `LINKEDIN_PROXY_URL=http://user:pass@host:port` in `apps/worker/.env` to activate proxy (optional — omit to run without)
  - Run a job search to verify session restore + feed warm-up in logs
  - Trigger an apply run and watch logs for 1.5s gaps between checkbox interactions
- **Follow-up items:**
  - Pick a residential proxy provider (Brightdata, Oxylabs, Smartproxy) and set `LINKEDIN_PROXY_URL` — this is the highest-impact remaining step
  - Apply agent `browser_type` still fills fields instantaneously (MCP limitation, no fix without forking `@playwright/mcp`)

---

## Notes

- **2026-06-06 — Revision:** Added `[ ]` task checkboxes for `/build-feature` compatibility; noted `ContextOptions` type needs replacing with `BrowserContextOptions` in Task 3b; added `loginOrManual` proxy parameter detail missing from Task 7b; added Task 6 (feed warm-up after session restore) which was identified during research but omitted from initial plan.
- **2026-06-07 — Revision:** Expanded Task 2 to verify actual Chromium version before hardcoding UA and add `sec-ch-ua` Client Hints headers; added StealthPlugin overlap note to Task 3a; added Known Limitations section documenting the apply agent instant-fill issue.
