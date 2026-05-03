import { jwtVerify, createRemoteJWKSet } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL!}/auth/v1/.well-known/jwks.json`)
);

export async function verifySupabaseJwt(
  req: Request
): Promise<{ email: string; sub: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: "authenticated",
    });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email, sub: payload.sub as string };
  } catch {
    return null;
  }
}
