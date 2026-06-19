import prisma from "@lib/prisma/prismaClient";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { isCanonicalCategory } from "@lib/categories";
import { upsertCurrentMonthDraftReport } from "@lib/reports/draftReport";
import { checkThresholdsAndNotify } from "@lib/notifications/thresholdCheck";

const BodySchema = z
  .object({
    userCategoryOverride: z
      .string()
      .nullable()
      .refine(
        (v) => v === null || isCanonicalCategory(v),
        "Invalid canonical category"
      )
      .optional(),
    userAmountOverride: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    userSoftDeleted: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.userCategoryOverride !== undefined ||
      b.userAmountOverride !== undefined ||
      b.notes !== undefined ||
      b.userSoftDeleted !== undefined,
    { message: "At least one editable field is required" }
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

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

  const row = await prisma.syncedTransaction.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row) {
    return Response.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (row.userId !== auth.user.id) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const data: Prisma.SyncedTransactionUpdateInput = {};
  const v = parsed.data;
  if (v.userCategoryOverride !== undefined) {
    data.userCategoryOverride = v.userCategoryOverride;
    // Mark genuine human corrections so they become ground truth for learning.
    data.categorySource = v.userCategoryOverride === null ? null : "user";
  }
  if (v.userAmountOverride !== undefined) data.userAmountOverride = v.userAmountOverride;
  if (v.notes !== undefined) data.notes = v.notes;
  if (v.userSoftDeleted !== undefined) data.userSoftDeleted = v.userSoftDeleted;

  await prisma.syncedTransaction.update({ where: { id }, data });

  try {
    const now = new Date();
    await upsertCurrentMonthDraftReport(auth.user.id, now);
    await checkThresholdsAndNotify(auth.user.id, now);
  } catch (err) {
    console.error("[mobile/transactions/synced PATCH] post-edit work failed:", err);
  }

  return Response.json({ success: true, response: { id } });
}
