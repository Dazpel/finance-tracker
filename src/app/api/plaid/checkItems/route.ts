import { options } from "@api/auth/[...nextauth]/options";
import { plaidClient } from "@lib/plaid";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { Transaction } from "plaid";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  const accounts = await findOrCreateUser(prisma, session.user.email);
  let transactions: Transaction[] = [];

  try {
    for (const account of accounts) {
        const response = await plaidClient.itemGet({
            access_token: account.accessToken || ""
          });
        const item = response.data.item;
        const status = response.data.status;
        console.log("\n Item:", item, "Status:", status, "Account:", account.accessToken);
        
    }
    
    return Response.json({ success: true, transactions });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
