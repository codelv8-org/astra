import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const secret = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(p: string) {
  if (p.length < 12 || p.length > 256)
    throw Error("Password must be 12–256 characters");
  const salt = secret();
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
export function verify(p: string, stored: string) {
  const [salt, h] = stored.split(":");
  const expected = Buffer.from(h, "hex");
  const actual = scryptSync(p, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
