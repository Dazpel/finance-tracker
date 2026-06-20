import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma v7 no longer auto-loads .env, and datasource URLs live here rather than
// in schema.prisma. `datasource.url` is used by the CLI / Schema Engine only
// (migrations, db push, introspection) — point it at the DIRECT (non-pooled)
// connection. The runtime query client uses the pooled DATABASE_URL via the
// driver adapter in src/lib/prisma/prismaClient.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
