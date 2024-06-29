import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";

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

    const users = await prisma.user.findMany({
      select: {
        email: true,
        accounts: true,
      },
      where: {
        accounts: {
          some: {
            NOT: {
              accessToken: undefined,
            },
            AND: {
              user: {
                email: {
                  in: process.env.EMAIL_WHITELIST
                    ? process.env.EMAIL_WHITELIST.split(",")
                    : [],
                },
              },
            },
          },
        },
      },
    });
    
    if (users.length === 0) {
      return NextResponse.json({ status: 200 });
    }

    console.log("-------- Request completed --------");

    return NextResponse.json({ status: 200 });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ status: 500 });
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
