import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@lib/prisma/prismaClient";
import { EXPENSE_KEYS } from "@lib/notifications/expenseKeys";

// Partial body: any subset of expense column keys, each a non-negative
// number under 1_000_000. Reject unknown keys.
const BodySchema = z
  .object(
    Object.fromEntries(
      EXPENSE_KEYS.map((k) => [
        k,
        z.number().min(0).lt(1_000_000).optional(),
      ])
    )
  )
  .strict();

export async function PUT(request: Request) {
  const session = await getServerSession(options);
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Empty body is a no-op success — guard against it to avoid an empty update.
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.expenseThreshold.upsert({
      where: { userId: user.id },
      update: parsed.data,
      create: { userId: user.id, ...parsed.data },
    });

    return Response.json({ success: true, response: updated });
  } catch (error) {
    console.error("[/api/prisma/thresholds/update]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
