# LinkedIn CAPTCHA Mitigation Plan

## Context

The automated search and apply flows repeatedly trigger LinkedIn CAPTCHA/security challenges, causing jobs to fail. Five root causes:

1. **Fresh login every run** — `loginToLinkedIn` is called on every search. LinkedIn flags repeated credential logins as automation.
2. **Headless Chromium fingerprinted** — `navigator.webdriver === true`, no stealth args.
3. **Fixed 1.5 s delays** — constant, inhuman predictability.
4. **Apply agent has no LinkedIn session** — Playwright MCP spawns fresh, hits the login wall before Easy Apply.
5. **CAPTCHA failures look like regular failures** — `status: "failed"` gives no signal to the user.

**Approach:** move LinkedIn credentials into a dedicated `linkedin_accounts` table (cleaner separation, future multi-platform support), add a `session_encrypted` column there for cookie persistence, add browser stealth + randomised delays, and pass the saved session to the apply agent's Playwright MCP via `--storage-state`.

---

## Implementation Tasks

### 1. [x] New `linkedin_accounts` table

**New file:** `packages/db/src/schema/linkedin-accounts.ts`

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const linkedinAccounts = pgTable("linkedin_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  sessionEncrypted: text("session_encrypted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LinkedInAccount = typeof linkedinAccounts.$inferSelect;
```

**File:** `packages/db/src/schema/index.ts` — add export:
```ts
export * from "./linkedin-accounts";
```

**File:** `packages/db/src/schema/profiles.ts` — remove the two LinkedIn columns:
```ts
// remove:
linkedinEmail: text("linkedin_email"),
linkedinPasswordEncrypted: text("linkedin_password_encrypted"),
```

**Run migration:**
```bash
pnpm generate
pnpm migrate
```

The migration will: create `linkedin_accounts`, drop `linkedin_email` and `linkedin_password_encrypted` from `profiles`.

---

### 2. [x] Add `"captcha"` to `searchRunStatusEnum`

**File:** `packages/db/src/schema/enums.ts`

```ts
export const searchRunStatusEnum = pgEnum("search_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "captcha",
]);
```

(Included in the same migration as task 1.)

---

### 3. [x] DB query helpers for `linkedin_accounts`

**New file:** `packages/db/src/queries/linkedin-accounts.ts`

```ts
import { eq } from "drizzle-orm";
import { linkedinAccounts } from "../schema/linkedin-accounts";
import type { Db } from "../db";

export async function getLinkedInAccount(db: Db, userId: string) {
  return db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.userId, userId))
    .then((r) => r[0] ?? null);
}

export async function upsertLinkedInAccount(
  db: Db,
  userId: string,
  values: { email: string; passwordEncrypted: string },
): Promise<void> {
  await db
    .insert(linkedinAccounts)
    .values({ userId, ...values, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: linkedinAccounts.userId,
      set: { email: values.email, passwordEncrypted: values.passwordEncrypted, updatedAt: new Date() },
    });
}

export async function saveLinkedInSession(
  db: Db,
  userId: string,
  sessionEncrypted: string,
): Promise<void> {
  await db
    .update(linkedinAccounts)
    .set({ sessionEncrypted, updatedAt: new Date() })
    .where(eq(linkedinAccounts.userId, userId));
}

export async function clearLinkedInSession(db: Db, userId: string): Promise<void> {
  await db
    .update(linkedinAccounts)
    .set({ sessionEncrypted: null, updatedAt: new Date() })
    .where(eq(linkedinAccounts.userId, userId));
}
```

**File:** `packages/db/src/queries/index.ts` — add export:
```ts
export * from "./linkedin-accounts";
```

---

### 4. [x] Update profile service + router

**File:** `packages/api/src/services/profile.service.ts`

- `upsertLinkedIn()` currently writes `linkedinEmail` + `linkedinPasswordEncrypted` to `profiles`.
- Change it to call `upsertLinkedInAccount(db, userId, { email, passwordEncrypted })` from `@repo/db` instead.
- Import `upsertLinkedInAccount` from `@repo/db`; remove references to the old profile columns.
- The `encrypt()` from `../lib/encrypt` is still used here to encrypt the password before passing to `upsertLinkedInAccount`.

**File:** `packages/api/src/routers/profile.ts`

- No interface changes — `upsertLinkedIn` mutation signature stays the same.
- `getLinkedInAccount` needs to be exported from `packages/api/src/index.ts` so server components can call it directly (same pattern as other services).

---

### 5. [x] Update LinkedIn profile page (frontend)

**File:** `apps/web/components/profile/linkedin-form.tsx`

- Currently receives `savedEmail` as a prop (the email from `profiles.linkedinEmail`).
- No changes needed to the component itself — just the data source changes.

**File:** wherever the LinkedIn profile tab page/layout lives (likely `apps/web/app/(dashboard)/profile/page.tsx` or similar)

- Currently fetches profile via `getProfileForUser` and passes `profile.linkedinEmail` as `savedEmail`.
- Change to also call `getLinkedInAccount(db, userId)` and pass `linkedinAccount?.email ?? null` as `savedEmail`.

---

### 6. [x] Worker — add `encrypt()` helper

**File:** `apps/worker/src/decrypt.ts`

Update the `node:crypto` import and add `encrypt()` (the worker cannot import from `packages/api`):

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const key = Buffer.from(env.LINKEDIN_ENCRYPTION_KEY, "hex");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}
```

---

### 7. [x] Browser stealth — launch args + `navigator.webdriver` patch

**File:** `packages/automation/src/browser.ts`

```ts
this.browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],
});
```

**File:** `packages/automation/src/search.ts`

After `context.newPage()`, add before any navigation:
```ts
await page.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
```

---

### 8. [x] Randomised delays

**File:** `packages/automation/src/linkedin/scraper.ts`

Remove `const DELAY_MS = 1500;` and replace both `page.waitForTimeout(DELAY_MS)` call sites with:
```ts
await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1500);
```

---

### 9. [x] Session persistence in `runSearch`

**File:** `packages/automation/src/search.ts`

New signature:
```ts
export async function runSearch(
  db: Db,
  userId: string,
  email: string,
  password: string,
  runId: string,
  existingSessionJson?: string,
): Promise<{ jobCount: number; newSessionJson: string | null }>
```

Replace `browser.newPage()` with context-aware logic:

```
1. browser = await browserManager.getBrowser()
2. If existingSessionJson provided:
   a. context = await browser.newContext({ storageState: JSON.parse(existingSessionJson) })
      (type cast as NonNullable<BrowserContextOptions["storageState"]> from "playwright")
   b. page = await context.newPage()
   c. await page.addInitScript(webdriver patch)
   d. await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded" })
   e. If page.url() does NOT contain "/feed" → session expired, await context.close(), fall through
   f. Else → session valid, newSessionJson = null
3. If no session or expired:
   a. context = await browser.newContext()
   b. page = await context.newPage()
   c. await page.addInitScript(webdriver patch)
   d. await loginToLinkedIn(page, email, password)
   e. newSessionJson = JSON.stringify(await context.storageState())
4. scrapeLinkedInJobs → scoreJob → insertJobs (unchanged)
5. finally: await context.close()
6. return { jobCount, newSessionJson }
```

---

### 10. [x] Update search worker

**File:** `apps/worker/src/workers/search.worker.ts`

- Read credentials from `getLinkedInAccount(db, userId)` instead of `profiles`.
- Decrypt saved session if present, pass to `runSearch`.
- After success, encrypt + save new session if `runSearch` returned one.
- On CAPTCHA, set run status to `"captcha"` and clear session.

```ts
import { encrypt, decrypt } from "../decrypt";
import { getLinkedInAccount, saveLinkedInSession, clearLinkedInSession, updateSearchRun } from "@repo/db";

const account = await getLinkedInAccount(db, userId);
if (!account) throw new Error("LinkedIn account not connected");

const password = decrypt(account.passwordEncrypted);
const existingSessionJson = account.sessionEncrypted
  ? decrypt(account.sessionEncrypted)
  : undefined;

// ... insertSearchRun ...

try {
  const { jobCount, newSessionJson } = await runSearch(
    db, userId, account.email, password, run.id, existingSessionJson,
  );
  if (newSessionJson) {
    await saveLinkedInSession(db, userId, encrypt(newSessionJson));
  }
  await updateSearchRun(db, run.id, { status: "completed", completedAt: new Date(), jobCount });
} catch (err) {
  const isCaptcha = err instanceof Error && err.message.toLowerCase().includes("captcha");
  await updateSearchRun(db, run.id, {
    status: isCaptcha ? "captcha" : "failed",
    completedAt: new Date(),
    errorMessage: err instanceof Error ? err.message : String(err),
  });
  if (isCaptcha) await clearLinkedInSession(db, userId);
  throw err;
}
```

---

### 11. [x] Update apply worker

**File:** `apps/worker/src/workers/apply.worker.ts`

Fetch the LinkedIn account and decrypt the session before calling `processApplyJob`:

```ts
import { decrypt } from "../decrypt";
import { getLinkedInAccount } from "@repo/db";

const account = await getLinkedInAccount(db, userId);
const linkedinSessionJson = account?.sessionEncrypted
  ? decrypt(account.sessionEncrypted)
  : undefined;

await processApplyJob(db, jobId, userId, linkedinSessionJson);
```

---

### 12. [x] `processApplyJob` — forward session

**File:** `packages/ai/src/agents/process-apply.ts`

```ts
export async function processApplyJob(
  db: Db,
  jobId: string,
  userId: string,
  linkedinSessionJson?: string,
) {
  // ...existing fetches...
  const result = await applyToJob(jobRow, profileRow, resumePdfPath, linkedinSessionJson);
  // ...rest unchanged...
}
```

---

### 13. [x] `applyToJob` — write temp file, pass to MCP

**File:** `packages/ai/src/agents/apply-agent.ts`

Add imports: `writeFile`, `rm` from `"node:fs/promises"`, `join` from `"node:path"`, `tmpdir` from `"node:os"`.

```ts
export async function applyToJob(
  job: Job,
  profile: Profile,
  resumePdfPath: string,
  linkedinSessionJson?: string,
): Promise<ApplyResult> {
  let storageStatePath: string | undefined;
  if (linkedinSessionJson) {
    storageStatePath = join(tmpdir(), `linkedin-session-${Date.now()}.json`);
    await writeFile(storageStatePath, linkedinSessionJson, "utf8");
  }
  const client = await createPlaywrightMCPClient(storageStatePath);
  try {
    // ...existing logic unchanged...
  } finally {
    await client.close();
    if (storageStatePath) await rm(storageStatePath, { force: true });
  }
}
```

---

### 14. [x] `createPlaywrightMCPClient` — accept `--storage-state`

**File:** `packages/ai/src/mcp.ts`

```ts
export async function createPlaywrightMCPClient(storageStatePath?: string) {
  const args = [playwrightMcpCli, "--headless"];
  if (storageStatePath) args.push("--storage-state", storageStatePath);
  return createMCPClient({
    transport: new Experimental_StdioMCPTransport({ command: "node", args }),
  });
}
```

---

## Files Modified / Created

| File | Change |
|------|--------|
| `packages/db/src/schema/linkedin-accounts.ts` | **New** — `linkedin_accounts` table |
| `packages/db/src/schema/profiles.ts` | Remove `linkedinEmail`, `linkedinPasswordEncrypted` |
| `packages/db/src/schema/enums.ts` | Add `"captcha"` to `searchRunStatusEnum` |
| `packages/db/src/schema/index.ts` | Export new schema |
| `packages/db/src/queries/linkedin-accounts.ts` | **New** — CRUD + session helpers |
| `packages/db/src/queries/index.ts` | Export new queries |
| `packages/api/src/services/profile.service.ts` | `upsertLinkedIn` → write to `linkedin_accounts` |
| `packages/api/src/index.ts` | Export `getLinkedInAccount` for server components |
| `apps/web` (profile LinkedIn page) | Read `savedEmail` from `linkedin_accounts` |
| `apps/worker/src/decrypt.ts` | Add `encrypt()` |
| `packages/automation/src/browser.ts` | Stealth launch args + `playwright-extra` stealth plugin |
| `packages/automation/src/search.ts` | Context-based session restore + new signature |
| `packages/automation/src/linkedin/scraper.ts` | Randomised delays |
| `apps/worker/src/workers/search.worker.ts` | Read from `linkedin_accounts`, save/clear session |
| `apps/worker/src/workers/apply.worker.ts` | Read session, pass to `processApplyJob` |
| `packages/ai/src/agents/process-apply.ts` | Forward `linkedinSessionJson` |
| `packages/ai/src/agents/apply-agent.ts` | Write temp file, pass to MCP |
| `packages/ai/src/mcp.ts` | Accept `--storage-state` arg |

---

## Verification

1. `pnpm typecheck && pnpm lint` — no errors after all changes.
2. `pnpm test` — existing tests pass (mock profile objects need `linkedinSessionEncrypted` removed since it's no longer on `Profile`; apply-agent test mock updated for new `applyToJob` signature).
3. **First search:** worker finds no `linkedin_accounts` row for user → error "LinkedIn account not connected" (user must re-save credentials via profile form since we dropped the old columns in migration).
4. **After saving credentials:** trigger search → full login → session saved to `linkedin_accounts.session_encrypted`.
5. **Second search:** session restored → navigates to `/feed` without re-login.
6. **Apply job:** session decrypted → temp file written → MCP starts with `--storage-state` → no login wall.
7. **CAPTCHA:** run shows `status: "captcha"`, session cleared, next run does fresh login.

---

## Completed

- **Date:** 2026-05-26
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/linkedin-accounts.ts` — new table with `email`, `passwordEncrypted`, `sessionEncrypted`
  - `packages/db/src/schema/profiles.ts` — removed `linkedinEmail`, `linkedinPasswordEncrypted`
  - `packages/db/src/schema/enums.ts` — added `"captcha"` to `searchRunStatusEnum`
  - `packages/db/src/schema/index.ts` — export new schema file
  - `packages/db/src/queries/linkedin-accounts.ts` — `getLinkedInAccount`, `upsertLinkedInAccount`, `saveLinkedInSession`, `clearLinkedInSession`
  - `packages/db/src/queries/index.ts` — export new queries file
  - `packages/db/drizzle/0002_pretty_cassandra_nova.sql` — migration applied
  - `packages/api/src/services/profile.service.ts` — `getProfile` returns `linkedinAccount`; `upsertLinkedIn` writes to `linkedin_accounts`
  - `packages/api/src/index.ts` — export `getLinkedInAccount`
  - `apps/worker/src/decrypt.ts` — added `encrypt()` (AES-256-GCM)
  - `packages/automation/src/browser.ts` — stealth launch args
  - `packages/automation/src/linkedin/scraper.ts` — randomized 1500–3500ms delays
  - `packages/automation/src/search.ts` — context-based session restore, new `{ jobCount, newSessionJson }` return type
  - `apps/worker/src/workers/search.worker.ts` — reads `linkedin_accounts`, saves/clears session, sets `"captcha"` status
  - `apps/worker/src/workers/apply.worker.ts` — reads session, passes to `processApplyJob`
  - `packages/ai/src/agents/process-apply.ts` — forwards `linkedinSessionJson`
  - `packages/ai/src/agents/apply-agent.ts` — writes temp file, passes to MCP, cleans up
  - `packages/ai/src/mcp.ts` — accepts `--storage-state` arg
  - `apps/web/components/profile/profile-content.tsx` — reads `savedEmail` from `linkedinAccount`
  - `packages/ai/src/agents/apply-agent.test.ts` — removed stale fields from mock profile
- **How to test:**
  1. Re-enter LinkedIn credentials via the profile form (old columns were removed in migration)
  2. Trigger a search — session is saved to `linkedin_accounts.session_encrypted` after first login
  3. Trigger a second search immediately — no re-login, navigates straight to `/feed`
  4. Trigger an apply — MCP starts pre-authenticated via `--storage-state`
- **Follow-up items:**
  - 3 pre-existing test failures in `packages/db/src/queries/jobs.test.ts` (`insertJobs` mock missing `.returning()` in chain) — not caused by these changes, existed before
  - Users who had LinkedIn credentials stored in the old `profiles` columns will need to re-enter them (migration drops those columns without data transfer)

### 16. [x] Headed manual login fallback

**File:** `packages/automation/src/search.ts`

When headless login throws a CAPTCHA error, automatically fall back to a headed browser so the user can solve the challenge manually, then resume the run with the captured session:

```
1. loginOrManual() attempts headless loginToLinkedIn()
2. If CAPTCHA error → manualHeadedLogin():
   - chromium.launch({ headless: false })
   - Navigate to /login, wait up to 5 min for user to reach /feed
   - Capture storageState, close headed browser
3. Open headless context with captured session, continue scraping
4. newSessionJson saved to DB — future runs skip login entirely
```

---

### 15. [x] `playwright-extra` stealth plugin

**File:** `packages/automation/src/browser.ts`

Replace plain `playwright` chromium import with `playwright-extra` + stealth plugin:

```ts
import type { Browser } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());
```

Patches 10+ bot-detection vectors (canvas fingerprint, WebGL, `chrome` runtime object, `permissions` API, `navigator.plugins`, etc.) beyond the manual `navigator.webdriver` patch.

**Install:**
```bash
pnpm add playwright-extra puppeteer-extra-plugin-stealth --filter @repo/automation
```
