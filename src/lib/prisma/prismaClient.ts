import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prismaClientSingleton = () => {
  // Prisma v7 requires a driver adapter. We connect through node-postgres using
  // the pooled DATABASE_URL (Supabase/Vercel pgbouncer endpoint).
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // v7 hands pooling to pg, whose connect timeout defaults to 0 (wait forever).
    // Restore Prisma v6's 5s behavior so a dead pooler fails fast.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    // The pooler terminates TLS with a cert pg can't verify in the chain.
    ssl: { rejectUnauthorized: false },
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    errorFormat: "pretty",
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
