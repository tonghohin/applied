import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: { LINKEDIN_ENCRYPTION_KEY: "a".repeat(64) },
}));

import { decrypt, encrypt } from "./encrypt.js";

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", () => {
    const plaintext = "hello world";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("throws on tampered ciphertext", () => {
    const token = encrypt("secret");
    const tampered = `${token.slice(0, -4)}0000`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on malformed token (missing parts)", () => {
    expect(() => decrypt("onlytwoparts")).toThrow();
  });
});
