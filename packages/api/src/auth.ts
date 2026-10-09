import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@repo/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { lastLoginMethod } from "better-auth/plugins";
import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
});

// A session lasts SESSION_EXPIRES_IN_SECONDS from the last refresh; any request at least
// SESSION_UPDATE_AGE_SECONDS after the previous refresh extends it, so active users stay signed in.
// The refreshed cookie only reaches the browser through the proxy (apps/web/proxy.ts).
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function createAuth() {
  const parsedEnv = envSchema.parse(process.env);
  const options: BetterAuthOptions = {
    secret: parsedEnv.BETTER_AUTH_SECRET,
    baseURL: parsedEnv.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", usePlural: true }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: { expiresIn: SESSION_EXPIRES_IN_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
    plugins: [lastLoginMethod()],
  };
  return betterAuth(options);
}

let _auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}
