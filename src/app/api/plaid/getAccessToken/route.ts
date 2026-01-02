import { plaidClient } from "@lib/plaid";
import { NextResponse } from "next/server";
import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { initialSyncForAccount } from "@lib/plaid/syncTransactions";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const publicToken: string = res.publicToken;
  const institutionName: string = res.institutionName;

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    if (!accessToken || !itemId) {
      return NextResponse.json({
        success: false,
        error: "Access token or Item Id not found",
      });
    }

    // Get user to get userId
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found",
      });
    }

    // Create PlaidAccount
    const plaidAccount = await prisma.user.update({
      where: {
        email: session.user.email,
      },
      data: {
        accounts: {
          create: {
            institutionName,
            accessToken,
            itemId,
          },
        },
      },
      select: {
        accounts: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    const createdAccount = plaidAccount.accounts[0];

    // Trigger initial sync in the background (don't wait for it to complete)
    // This allows the user to get immediate feedback while sync happens async
    initialSyncForAccount(accessToken, createdAccount.id, user.id)
      .then((result) => {
        if (result.success) {
          console.log(`Initial sync completed for account ${createdAccount.id}`);
        } else {
          console.error(`Initial sync failed for account ${createdAccount.id}:`, result.error);
        }
      })
      .catch((error) => {
        console.error(`Error in initial sync for account ${createdAccount.id}:`, error);
      });

    return NextResponse.json({
      success: true,
      error: "Accounts linked successfully",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error,
    });
  }
}
