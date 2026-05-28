import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

sdk.start();
