import prisma from "@lib/prisma/prismaClient";
import { verifySupabaseJwt } from "./verifySupabaseJwt";

export type RequireMobileUserResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; response: Response };

export async function requireMobileUser(
  req: Request
): Promise<RequireMobileUserResult> {
  const auth = await verifySupabaseJwt(req);
  if (!auth) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: auth.email },
    select: { id: true, email: true, authorized: true },
  });
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "User not found" }, { status: 404 }),
    };
  }
  if (!user.authorized) {
    return {
      ok: false,
      response: Response.json({ error: "Not authorized" }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: user.id, email: user.email } };
}
