import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

export async function assertDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const wrapped = new Error(
      "Database is unavailable. Check DATABASE_URL and that PostgreSQL is running."
    );
    wrapped.cause = error;
    wrapped.code = "DATABASE_UNAVAILABLE";
    throw wrapped;
  }
}
