import { z } from "zod";
import { Prisma } from "@generated/prisma/client";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

const PostBodySchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/),
  deviceId: z.uuid(),
});

const DeleteBodySchema = z.object({
  token: z.string(),
});

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Scope the pre-upsert cleanup so an authenticated user can only clear rows
    // they own (stale re-register) or rows tied to the same physical device
    // (legitimate user-A → user-B handoff). An attacker passing another user's
    // token with a different deviceId hits neither branch and the deleteMany
    // becomes a no-op.
    await prisma.$transaction([
      prisma.pushToken.deleteMany({
        where: {
          token: parsed.data.token,
          OR: [
            { userId: auth.user.id },
            { deviceId: parsed.data.deviceId },
          ],
        },
      }),
      prisma.pushToken.upsert({
        where: {
          userId_deviceId: { userId: auth.user.id, deviceId: parsed.data.deviceId },
        },
        update: { token: parsed.data.token },
        create: {
          userId: auth.user.id,
          deviceId: parsed.data.deviceId,
          token: parsed.data.token,
        },
      }),
    ]);
    return Response.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // token @unique violated — token is held by a different user on a
      // different device. Tell the client to request a fresh Expo token.
      return Response.json(
        { success: false, error: "Token already registered" },
        { status: 409 }
      );
    }
    console.error("[/api/push-tokens POST]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await prisma.pushToken.deleteMany({
      where: { userId: auth.user.id, token: parsed.data.token },
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("[/api/push-tokens DELETE]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
