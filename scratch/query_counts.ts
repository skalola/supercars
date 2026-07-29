import { prisma } from "../lib/prisma";

async function main() {
  const lambo = await prisma.partnerContact.count({ where: { makeSpecialization: { contains: "Lamborghini" }, type: "DEALER" }});
  const ferrari = await prisma.partnerContact.count({ where: { makeSpecialization: { contains: "Ferrari" }, type: "DEALER" }});
  const transporters = await prisma.partnerContact.count({ where: { type: "TRANSPORTER" }});
  const insurers = await prisma.partnerContact.count({ where: { type: "INSURER" }});
  
  console.log(`Lamborghini Dealers: ${lambo}`);
  console.log(`Ferrari Dealers: ${ferrari}`);
  console.log(`Transporters: ${transporters}`);
  console.log(`Insurers: ${insurers}`);
  
  const allLambo = await prisma.partnerContact.findMany({ where: { makeSpecialization: { contains: "Lamborghini" }, type: "DEALER" }});
  console.log("Sample lambo:", allLambo.slice(0, 3).map(l => ({ name: l.name, status: l.contactStatus, active: l.active })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
