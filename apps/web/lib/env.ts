import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.url("NEXT_PUBLIC_BASE_URL must be a valid URL"),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
});
