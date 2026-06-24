import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@repo/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { lastLoginMethod } from "better-auth/plugins";
import { authEnv as env } from "./auth-env";

const authOptions: BetterAuthOptions = {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [lastLoginMethod()],
};

export const auth = betterAuth(authOptions);
