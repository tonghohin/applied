"use client";

import { createAuthClient } from "better-auth/client";
import { lastLoginMethodClient } from "better-auth/client/plugins";
import { env } from "./env";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BASE_URL,
  plugins: [lastLoginMethodClient()],
});
