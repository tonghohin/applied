import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  LINKEDIN_ENCRYPTION_KEY: z
    .string()
    .length(64, "LINKEDIN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
});

export const env = envSchema.parse(process.env);
