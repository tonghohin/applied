// Exposed as `@repo/ai/errors` (and re-exported from the root) — keep it dependency-free so the
// web app's API layer can import it without pulling in the agent.
// The AI Gateway's credential errors are written for developers ("set AI_GATEWAY_API_KEY") and
// carry terminal colour codes; users bring their own key via Settings, so translate them.
const AUTH_ERROR_NAMES = new Set(["GatewayAuthenticationError", "GatewayForbiddenError"]);

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export const INVALID_AI_KEY_MESSAGE =
  "Your AI Gateway key was rejected. Check it in Settings → AI.";

export function isAiKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (AUTH_ERROR_NAMES.has(error.name)) return true;
  const statusCode = Reflect.get(error, "statusCode");
  if (statusCode === 401 || statusCode === 403) return true;
  // The AI SDK wraps errors it gave up retrying in a RetryError; the real cause is lastError
  return isAiKeyError(Reflect.get(error, "lastError"));
}

export function describeAiError(error: unknown): string {
  if (isAiKeyError(error)) return INVALID_AI_KEY_MESSAGE;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(ANSI_ESCAPE, "").replace(/\s+/g, " ").trim() || "Unknown error";
}
