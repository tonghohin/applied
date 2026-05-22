import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url("NEXT_PUBLIC_API_URL must be a valid URL"),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
