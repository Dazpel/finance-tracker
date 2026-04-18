import { createHash, timingSafeEqual } from "crypto";
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from "jose";
import { plaidClient } from "./client";

const KID_PATTERN = /^[0-9a-f-]{36}$/i;
const MAX_KEYS = 32;
const NEGATIVE_TTL_MS = 60_000;

const keyCache = new Map<string, JWK>();
const negativeCache = new Map<string, number>();

const rememberKey = (kid: string, jwk: JWK) => {
  if (keyCache.size >= MAX_KEYS) {
    const oldest = keyCache.keys().next().value;
    if (oldest) keyCache.delete(oldest);
  }
  keyCache.set(kid, jwk);
};

const getKey = async (kid: string): Promise<JWK | null> => {
  const cached = keyCache.get(kid);
  if (cached) return cached;

  const failedAt = negativeCache.get(kid);
  if (failedAt && Date.now() - failedAt < NEGATIVE_TTL_MS) return null;

  try {
    const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    const key = response.data.key as unknown as JWK;
    rememberKey(kid, key);
    negativeCache.delete(kid);
    return key;
  } catch (error) {
    negativeCache.set(kid, Date.now());
    console.error("Failed to fetch Plaid webhook verification key:", error);
    return null;
  }
};

export const verifyPlaidWebhook = async (
  rawBody: string,
  headers: Headers
): Promise<boolean> => {
  const signedJwt = headers.get("plaid-verification");
  if (!signedJwt) return false;

  let kid: string | undefined;
  try {
    kid = decodeProtectedHeader(signedJwt).kid;
  } catch {
    return false;
  }
  if (!kid || !KID_PATTERN.test(kid)) return false;

  const jwk = await getKey(kid);
  if (!jwk) return false;

  let payload: { request_body_sha256?: string };
  try {
    const keyLike = await importJWK(jwk);
    const result = await jwtVerify(signedJwt, keyLike, { maxTokenAge: "5 min" });
    payload = result.payload as { request_body_sha256?: string };
  } catch {
    return false;
  }

  const claimed = payload.request_body_sha256;
  if (!claimed) return false;

  const actual = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(claimed, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};
