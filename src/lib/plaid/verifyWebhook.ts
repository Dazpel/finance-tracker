import { createHash, timingSafeEqual } from "crypto";
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from "jose";
import { plaidClient } from "@lib/plaid";

const keyCache = new Map<string, JWK>();

const getKey = async (kid: string): Promise<JWK | null> => {
  const cached = keyCache.get(kid);
  if (cached) return cached;

  try {
    const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    const key = response.data.key as unknown as JWK;
    keyCache.set(kid, key);
    return key;
  } catch (error) {
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
  if (!kid) return false;

  const jwk = await getKey(kid);
  if (!jwk) return false;

  let payload: { request_body_sha256?: string };
  try {
    const keyLike = await importJWK(jwk, "ES256");
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
