import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("--- SEEDING MAINTENANCE RULES ---");

  // Clean existing rules
  await prisma.maintenanceRule.deleteMany({});
  console.log("Cleared existing MaintenanceRules.");

  // Fetch models to map model-specific rules
  const countach = await prisma.model.findFirst({ where: { name: { contains: "Countach" } } });
  const diablo = await prisma.model.findFirst({ where: { name: { contains: "Diablo" } } });
  const gallardo = await prisma.model.findFirst({ where: { name: { contains: "Gallardo" } } });
  const huracan = await prisma.model.findFirst({ where: { name: { contains: "Huracan" } } });

  const f40 = await prisma.model.findFirst({ where: { name: { contains: "F40" } } });
  const testarossa = await prisma.model.findFirst({ where: { name: { contains: "Testarossa" } } });
  const italia458 = await prisma.model.findFirst({ where: { name: { contains: "458" } } });
  const gtb488 = await prisma.model.findFirst({ where: { name: { contains: "488" } } });

  const rulesData = [
    // ----------------------------------------------------
    // Universal Performance Vehicle Rules (modelId = null)
    // ----------------------------------------------------
    {
      modelId: null,
      category: "Fluids",
      serviceName: "Oil Service",
      description: "Engine oil and filter change to protect internal components.",
      intervalMiles: 5000,
      intervalMonths: 12,
      priority: "REQUIRED"
    },
    {
      modelId: null,
      category: "Fluids",
      serviceName: "Brake Fluid Flush",
      description: "Flush and replace brake fluid to prevent water contamination and soft pedal.",
      intervalMiles: 20000,
      intervalMonths: 24,
      priority: "REQUIRED"
    },
    {
      modelId: null,
      category: "Fluids",
      serviceName: "Coolant Replacement",
      description: "Replace engine coolant to maintain optimal thermal management.",
      intervalMiles: 40000,
      intervalMonths: 48,
      priority: "RECOMMENDED"
    },
    {
      modelId: null,
      category: "Brakes",
      serviceName: "Brake Inspection",
      description: "Inspect brake pads, rotors, and calipers for wear.",
      intervalMiles: 10000,
      intervalMonths: 12,
      priority: "INSPECT"
    },
    {
      modelId: null,
      category: "Tires",
      serviceName: "Tire Replacement",
      description: "Inspect and replace performance tires due to soft compound wear.",
      intervalMiles: 15000,
      intervalMonths: null,
      priority: "RECOMMENDED"
    },
    {
      modelId: null,
      category: "Inspection",
      serviceName: "Multi-Point Inspection",
      description: "Full safety and mechanical inspection.",
      intervalMiles: 10000,
      intervalMonths: 12,
      priority: "INSPECT"
    },

    // ----------------------------------------------------
    // Ferrari F40
    // ----------------------------------------------------
    ...(f40 ? [
      {
        modelId: f40.id,
        category: "Engine",
        serviceName: "Kevlar Fuel Cell Bladder Replacement",
        description: "Replace the rubber bladder fuel cells every 8 to 10 years as required by factory safety standards.",
        intervalMiles: null,
        intervalMonths: 96,
        priority: "REQUIRED"
      },
      {
        modelId: f40.id,
        category: "Engine",
        serviceName: "Timing Belt Replacement",
        description: "Timing belt replacement is critical on the twin-turbo V8 to avoid catastrophic engine failure.",
        intervalMiles: 15000,
        intervalMonths: 36,
        priority: "REQUIRED"
      }
    ] : []),

    // ----------------------------------------------------
    // Ferrari Testarossa
    // ----------------------------------------------------
    ...(testarossa ? [
      {
        modelId: testarossa.id,
        category: "Engine",
        serviceName: "Engine-Out Belt Service",
        description: "Engine must be dropped to replace the timing belts and tensioner bearings.",
        intervalMiles: 15000,
        intervalMonths: 60,
        priority: "REQUIRED"
      }
    ] : []),

    // ----------------------------------------------------
    // Ferrari 458 Italia
    // ----------------------------------------------------
    ...(italia458 ? [
      {
        modelId: italia458.id,
        category: "Transmission",
        serviceName: "Dual-Clutch Gearbox Oil Service",
        description: "Replace transmission and clutch fluid to ensure smooth gear engagement.",
        intervalMiles: 30000,
        intervalMonths: 60,
        priority: "RECOMMENDED"
      }
    ] : []),

    // ----------------------------------------------------
    // Ferrari 488 GTB
    // ----------------------------------------------------
    ...(gtb488 ? [
      {
        modelId: gtb488.id,
        category: "Engine",
        serviceName: "Turbocharger Inspection",
        description: "Inspect turbo seals, wastegates, and play to ensure peak boost performance.",
        intervalMiles: 20000,
        intervalMonths: null,
        priority: "INSPECT"
      }
    ] : []),

    // ----------------------------------------------------
    // Lamborghini Countach
    // ----------------------------------------------------
    ...(countach ? [
      {
        modelId: countach.id,
        category: "Engine",
        serviceName: "Valve Clearance Adjustment",
        description: "Adjust valve clearances on the classic carbureted V12 engine.",
        intervalMiles: 15000,
        intervalMonths: null,
        priority: "REQUIRED"
      }
    ] : []),

    // ----------------------------------------------------
    // Lamborghini Diablo
    // ----------------------------------------------------
    ...(diablo ? [
      {
        modelId: diablo.id,
        category: "Suspension",
        serviceName: "Lifting System Check",
        description: "Check hydraulic lift system for leaks or pressure issues.",
        intervalMiles: 10000,
        intervalMonths: 12,
        priority: "INSPECT"
      }
    ] : []),

    // ----------------------------------------------------
    // Lamborghini Gallardo
    // ----------------------------------------------------
    ...(gallardo ? [
      {
        modelId: gallardo.id,
        category: "Transmission",
        serviceName: "E-Gear Snap Clutch Wear Test",
        description: "Check clutch wear percentage on the E-Gear robotic transmission.",
        intervalMiles: 15000,
        intervalMonths: null,
        priority: "INSPECT"
      }
    ] : []),

    // ----------------------------------------------------
    // Lamborghini Huracan
    // ----------------------------------------------------
    ...(huracan ? [
      {
        modelId: huracan.id,
        category: "Transmission",
        serviceName: "LDF Dual-Clutch Oil Service",
        description: "Replace oil in the Lamborghini Doppia Frizione (LDF) gearbox.",
        intervalMiles: 45000,
        intervalMonths: null,
        priority: "RECOMMENDED"
      }
    ] : [])
  ];

  for (const rule of rulesData) {
    await prisma.maintenanceRule.create({
      data: rule
    });
  }

  console.log(`Seeded ${rulesData.length} MaintenanceRules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
