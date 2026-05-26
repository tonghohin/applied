import { z } from "zod";

const envSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1, "AI_GATEWAY_API_KEY is required"),
});

export const env = envSchema.parse(process.env);
