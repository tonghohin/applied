import * as dotenv from "dotenv";
import * as path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
});

export const env = envSchema.parse(process.env);
