import { describe, expect, it } from "vitest";
import { INVALID_AI_KEY_MESSAGE, describeAiError, isAiKeyError } from "./errors";

function namedError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

const ESC = String.fromCharCode(27);

describe("describeAiError", () => {
  it("replaces gateway credential errors with a Settings hint", () => {
    const error = namedError(
      "GatewayAuthenticationError",
      `${ESC}[1m${ESC}[31mUnauthenticated request to AI Gateway.${ESC}[0m set AI_GATEWAY_API_KEY`
    );

    expect(isAiKeyError(error)).toBe(true);
    expect(describeAiError(error)).toBe(INVALID_AI_KEY_MESSAGE);
  });

  it("treats 401/403 responses as key errors", () => {
    const error = Object.assign(new Error("Forbidden"), { statusCode: 403 });

    expect(describeAiError(error)).toBe(INVALID_AI_KEY_MESSAGE);
  });

  it("finds a key error wrapped in the AI SDK's RetryError", () => {
    const retryError = Object.assign(new Error("Failed after 3 attempts"), {
      name: "AI_RetryError",
      lastError: namedError("GatewayAuthenticationError", "Unauthenticated"),
    });

    expect(describeAiError(retryError)).toBe(INVALID_AI_KEY_MESSAGE);
  });

  it("strips terminal colour codes and collapses whitespace from other errors", () => {
    const error = new Error(`${ESC}[31mRate limited.${ESC}[0m\n\nTry again   later`);

    expect(isAiKeyError(error)).toBe(false);
    expect(describeAiError(error)).toBe("Rate limited. Try again later");
  });

  it("handles non-Error values", () => {
    expect(describeAiError("boom")).toBe("boom");
    expect(describeAiError(new Error("   "))).toBe("Unknown error");
  });
});
