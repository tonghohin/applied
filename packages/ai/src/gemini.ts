import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { env } from "./env.js";

const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });

export const gemini: LanguageModel = google("gemini-2.5-flash");
