import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@repo/db";
import { betterAuth } from "better-auth";
import { env } from "./env.js";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.ALLOWED_ORIGIN],
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  account: {
    accountLinking: { enabled: true },
  },
});
