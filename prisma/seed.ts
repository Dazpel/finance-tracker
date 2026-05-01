import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
