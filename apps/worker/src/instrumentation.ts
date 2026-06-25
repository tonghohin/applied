import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { registerTelemetry } from "ai";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

sdk.start();
registerTelemetry(new LangfuseVercelAiSdkIntegration());
