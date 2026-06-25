import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@repo/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { lastLoginMethod } from "better-auth/plugins";
import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
});

function createAuth() {
  const parsedEnv = envSchema.parse(process.env);
  const options: BetterAuthOptions = {
    secret: parsedEnv.BETTER_AUTH_SECRET,
    baseURL: parsedEnv.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", usePlural: true }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [lastLoginMethod()],
  };
  return betterAuth(options);
}

let _auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}
