/**
 * Standalone helper: decodes a Supabase access token via verifySupabaseJwt
 * and prints the resulting { email, sub } payload (or null + exit 1).
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/verify-supabase-jwt.ts <token>
 */
import { verifySupabaseJwt } from "../src/lib/auth/verifySupabaseJwt";

const main = async () => {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: verify-supabase-jwt.ts <token>");
    process.exit(1);
  }

  const req = new Request("http://localhost/verify", {
    headers: { authorization: `Bearer ${token}` },
  });

  const result = await verifySupabaseJwt(req);
  if (!result) {
    console.log(null);
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
