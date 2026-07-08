import { plaidClient } from "@lib/plaid";
import { z } from "zod";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

const BodySchema = z.object({
  publicToken: z.string().min(1),
  institutionName: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { publicToken, institutionName } = parsed.data;

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    if (!accessToken || !itemId) {
      return Response.json(
        { success: false, error: "Access token or Item ID not found" },
        { status: 502 }
      );
    }

    // itemId is globally @unique, so upsert keys on it — but that would let the
    // update branch overwrite a row owned by another user. Verify ownership first
    // (mobile CLAUDE.md rule #2: scope every upsert to the authenticated user).
    const existing = await prisma.plaidAccount.findUnique({
      where: { itemId },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      return Response.json(
        { success: false, error: "Account already linked" },
        { status: 409 }
      );
    }

    const account = await prisma.plaidAccount.upsert({
      where: { itemId },
      create: { institutionName, accessToken, itemId, userId },
      update: { institutionName, accessToken },
      select: { id: true, institutionName: true },
    });

    return Response.json({
      success: true,
      response: { id: account.id, institutionName: account.institutionName },
    });
  } catch (error) {
    console.error("[/api/mobile/plaid/exchange-public-token]", error);
    return Response.json(
      { success: false, error: "Failed to add account" },
      { status: 500 }
    );
  }
}
