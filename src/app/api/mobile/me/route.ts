import prisma from "@lib/prisma/prismaClient";
import { verifySupabaseJwt } from "@lib/auth/verifySupabaseJwt";

export async function GET(request: Request) {
  const auth = await verifySupabaseJwt(request);
  if (!auth) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Returns the whitelist verdict so the mobile app can render the
  // "not authorized" screen without needing direct DB access.
  // Distinct from /api/mobile/* routes which use requireMobileUser and 403
  // on !authorized — here we want the verdict in a 200 body, not an error.
  const user = await prisma.user.findUnique({
    where: { email: auth.email },
    select: { id: true, email: true, authorized: true },
  });

  if (!user) {
    return Response.json({
      success: true,
      response: { authorized: false, user: null, reason: "User not found" },
    });
  }

  return Response.json({
    success: true,
    response: {
      authorized: user.authorized,
      user: user.authorized ? { id: user.id, email: user.email } : null,
    },
  });
}
