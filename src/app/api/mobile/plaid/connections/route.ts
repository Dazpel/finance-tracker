import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  try {
    const accounts = await prisma.plaidAccount.findMany({
      where: { userId },
      select: {
        id: true,
        institutionName: true,
        accessToken: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const connections = await Promise.all(
      accounts.map(async (account) => {
        try {
          await plaidClient.accountsGet({ access_token: account.accessToken });
          return {
            id: account.id,
            institutionName: account.institutionName,
            needsUpdate: false,
            createdAt: account.createdAt.toISOString(),
          };
        } catch (error: any) {
          // Any accountsGet failure (not narrowed to ITEM_LOGIN_REQUIRED) is
          // treated as "needs update" — a broad signal is safer than missing
          // a re-auth-required state the UI should surface.
          return {
            id: account.id,
            institutionName: account.institutionName,
            needsUpdate: true,
            errorCode: error?.response?.data?.error_code ?? "UNKNOWN_ERROR",
            createdAt: account.createdAt.toISOString(),
          };
        }
      })
    );

    return Response.json({ success: true, response: { connections } });
  } catch (error) {
    console.error("[/api/mobile/plaid/connections GET]", error);
    return Response.json(
      { success: false, error: "Failed to load connections" },
      { status: 500 }
    );
  }
}
