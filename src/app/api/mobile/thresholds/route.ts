import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { thresholdUpdateSchema } from "@lib/notifications/thresholdUpdateSchema";

export async function PATCH(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = thresholdUpdateSchema.safeParse(body);
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
    const updated = await prisma.expenseThreshold.upsert({
      where: { userId: auth.user.id },
      update: parsed.data,
      create: { userId: auth.user.id, ...parsed.data },
    });

    return Response.json({ success: true, response: updated });
  } catch (error) {
    console.error("[/api/mobile/thresholds]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
