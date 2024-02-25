import { plaidClient } from "@lib/plaid";
import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  const res = await request.json();
  const accessToken: string = res.accessToken;

  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: "Access token or Item Id not found",
    });
  }
  
  try {
    const response = await plaidClient.itemRemove({
      access_token: accessToken,
    });
    
    if (response.data.request_id) {
      await prisma.plaidAccount.deleteMany({
        where: {
          accessToken: accessToken,
        },
      });

      return NextResponse.json({
        success: true,
        error: "Connection removed successfully",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Connection not removed",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error,
    });
  }
}
