import { plaidClient } from "@lib/plaid";
import { NextResponse } from "next/server";
import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

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

    await prisma.user.update({
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
