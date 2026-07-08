import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;
  const { id: connectionId } = await params;

  try {
    const account = await prisma.plaidAccount.findFirst({
      where: { id: connectionId, userId },
      select: { accessToken: true },
    });

    if (!account) {
      return Response.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
    }

    const response = await plaidClient.itemRemove({
      access_token: account.accessToken,
    });

    if (!response.data.request_id) {
      return Response.json(
        { success: false, error: "Connection not removed" },
        { status: 502 }
      );
    }

    // Deleting a PlaidAccount cascades automatically to SyncedTransaction,
    // PlaidCursor, and PlaidSyncLock via DB constraints — no manual cleanup.
    await prisma.plaidAccount.deleteMany({
      where: { id: connectionId, userId },
    });

    return Response.json({ success: true, response: null });
  } catch (error) {
    console.error("[/api/mobile/plaid/connections/[id] DELETE]", error);
    return Response.json(
      { success: false, error: "Failed to remove account" },
      { status: 500 }
    );
  }
}
