import { jwtVerify, createRemoteJWKSet } from "jose";

let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!JWKS) {
    JWKS = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return JWKS;
}

export async function verifySupabaseJwt(
  req: Request
): Promise<{ email: string; sub: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      audience: "authenticated",
    });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email, sub: payload.sub as string };
  } catch {
    return null;
  }
}
