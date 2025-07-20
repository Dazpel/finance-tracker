import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";

async function pingWithRetry(attempts = 3, delayMs = 500): Promise<void> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1;`;
      return;
    } catch (err) {
      lastErr = err;
      // if this was the last try, rethrow
      if (i === attempts - 1) break;
      await new Promise((res) => setTimeout(res, delayMs * 2 ** i));
    }
  }
  throw lastErr;
}

export async function POST(request: Request) {
  const initTimer = Date.now();
  try {
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return Response.json(
        { message: "Invalid authorization header" },
        { status: 200 }
      );
    }
    console.log("-----------------------------------");
    console.log("------- Request to create keep db alive -------");
    console.log("-----------------------------------");

    await pingWithRetry();
    console.log(`✅ db is awake (${Date.now() - initTimer}ms)`);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ status: 500 });
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
