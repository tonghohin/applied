import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  LINKEDIN_ENCRYPTION_KEY: z
    .string()
    .length(64, "LINKEDIN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  LANGFUSE_PUBLIC_KEY: z.string().min(1, "LANGFUSE_PUBLIC_KEY is required"),
  LANGFUSE_SECRET_KEY: z.string().min(1, "LANGFUSE_SECRET_KEY is required"),
  LANGFUSE_BASE_URL: z.string().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);
