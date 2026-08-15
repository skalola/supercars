import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const queryReportingEnabled = process.env.PARTS_QUERY_REPORT === "1";
const prismaOptions: Prisma.PrismaClientOptions = {
  log: queryReportingEnabled
    ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "error" }, { emit: "stdout", level: "warn" }]
    : ["error", "warn"],
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaOptions);

export const prismaQueryMetrics = { count: 0 };
if (queryReportingEnabled) {
  const reportingClient = prisma as unknown as {
    $on(event: "query", callback: () => void): void;
  };
  reportingClient.$on("query", () => {
    prismaQueryMetrics.count += 1;
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
