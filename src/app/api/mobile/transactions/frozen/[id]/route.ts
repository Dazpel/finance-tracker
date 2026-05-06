import prisma from "@lib/prisma/prismaClient";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { isCanonicalCategory } from "@lib/categories";
import { recomputeFrozenReportTotals } from "@lib/reports/recomputeFrozenReportTotals";

const BodySchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z
      .string()
      .refine(isCanonicalCategory, "Invalid canonical category")
      .optional(),
    amount: z.number().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.category !== undefined ||
      b.amount !== undefined ||
      b.notes !== undefined,
    { message: "At least one editable field is required" }
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ success: false, error: "Invalid id" }, { status: 400 });
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

  const row = await prisma.transaction.findUnique({
    where: { id },
    select: { userId: true, reportId: true },
  });
  if (!row) {
    return Response.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (row.userId !== auth.user.id) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const data: Prisma.TransactionUpdateInput = {};
  const v = parsed.data;
  if (v.name !== undefined) data.name = v.name;
  if (v.amount !== undefined) data.amount = v.amount;
  if (v.notes !== undefined) data.notes = v.notes;
  if (v.category !== undefined) data.category = [v.category];

  // Atomic update + recompute: APPROVED Reports must never disagree with
  // their Transaction rows. If recompute fails, the row update is rolled back.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data });
      await recomputeFrozenReportTotals(row.reportId, tx);
    });
  } catch (err) {
    console.error("[mobile/transactions/frozen PATCH] tx failed:", err);
    return Response.json(
      { success: false, error: "Update failed" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, response: { id: idStr } });
}
