/**
 * Probe: what breaks on a fresh registration against cosmoz_test?
 * Lists public tables + attempts the same inserts the identity register
 * performs, printing the REAL Prisma error.
 */
process.env.DATABASE_URL = "postgresql://cosmoz@127.0.0.1:5433/cosmoz_test";
const { PrismaClient } = require("/home/z/my-project/apps/api/node_modules/@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  console.log(`tables in cosmoz_test: ${tables.length}`);
  console.log(tables.map((t) => t.tablename).join(", "));

  // Mimic the minimal identity register write path (User row).
  try {
    const user = await prisma.user.create({
      data: {
        email: `probe-${Date.now()}@cosmoz.app`,
        passwordHash: "x",
        name: "Probe",
        status: "PENDING_VERIFICATION",
      },
    });
    console.log("user.create OK:", user.id);
    await prisma.user.delete({ where: { id: user.id } });
  } catch (error) {
    console.log("user.create FAILED:", error.constructor.name, error.code ?? "", error.message.slice(0, 400));
  }
}

main()
  .catch((e) => {
    console.error("probe fatal:", e.message?.slice(0, 300));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
