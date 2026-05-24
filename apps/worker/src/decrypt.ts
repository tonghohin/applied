import { createDecipheriv } from "node:crypto";
import { env } from "./env";

export function decrypt(token: string): string {
  const [ivHex, authTagHex, ciphertextHex] = token.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Invalid encrypted token format");
  const key = Buffer.from(env.LINKEDIN_ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(Buffer.from(ciphertextHex, "hex")).toString("utf8") + decipher.final("utf8");
}
