import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";
import { env } from "./env";

const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });

export const model: LanguageModel = gateway("google/gemini-2.5-flash");
