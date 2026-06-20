import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The seed runs outside Next (via `tsx prisma/seed.ts`), so it builds its own
// adapter-backed client rather than reusing the app singleton.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding: backfilling ExpenseThreshold rows for existing users...");

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const existing = await prisma.expenseThreshold.findUnique({
      where: { userId: u.id },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.expenseThreshold.create({ data: { userId: u.id } });
    created++;
    console.log(`  + ExpenseThreshold for ${u.email}`);
  }

  console.log(`Done. Created ${created}, skipped ${skipped} (already had rows).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
