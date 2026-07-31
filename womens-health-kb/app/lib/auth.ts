import crypto from "crypto";

// Minimal single-password gate. The cookie stores an HMAC of a fixed marker so
// it can't be forged without AUTH_SECRET, and carries no user data.
const MARKER = "whkb-ok";

export function expectedToken(): string {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  return crypto.createHmac("sha256", secret).update(MARKER).digest("hex");
}

export function checkPassword(input: string): boolean {
  const expected = process.env.SITE_PASSWORD || "";
  if (!expected) return false;
  // constant-time compare
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const COOKIE_NAME = "whkb_auth";
