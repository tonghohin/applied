import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);
