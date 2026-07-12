import prisma from "@lib/prisma/prismaClient";
import { syncTransactionsForAccount } from "@lib/plaid/syncTransactions";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(options);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "accessToken is required" },
        { status: 400 }
      );
    }

    // The userId filter is mandatory — one user must never sync another user's item.
    const account = await prisma.plaidAccount.findFirst({
      where: { accessToken, userId: user.id },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
    }

    const result = await syncTransactionsForAccount(account.id);

    return NextResponse.json({
      success: true,
      result: {
        added: result.added,
        modified: result.modified,
        removed: result.removed,
        pages: result.pages,
        skipped: result.skipped ?? false,
      },
    });
  } catch (error: unknown) {
    console.error("Plaid sync now error:", error);
    const code = (error as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;

    return NextResponse.json(
      { success: false, error: code ?? "Sync failed" },
      { status: 500 }
    );
  }
}
