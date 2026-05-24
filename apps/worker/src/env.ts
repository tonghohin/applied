import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  LINKEDIN_ENCRYPTION_KEY: z
    .string()
    .length(64, "LINKEDIN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
});

export const env = envSchema.parse(process.env);
