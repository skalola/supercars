export type GarageStatsVehicle = {
  model: { name: string; make: { name: string }; spec: { topSpeed: string | null } | null };
  modifications: unknown[];
  listings: Array<{ askingPrice: number | null; price: number | null }>;
};

export function getGarageStats(vehicles: GarageStatsVehicle[], totalCars: number) {
  const spent = vehicles.reduce((sum, vehicle) => sum + (vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? 0), 0);
  const fastest = vehicles
    .map((vehicle) => ({ vehicle, mph: parseMph(vehicle.model.spec?.topSpeed) }))
    .filter((item): item is { vehicle: GarageStatsVehicle; mph: number } => item.mph !== null)
    .sort((a, b) => b.mph - a.mph)[0];
  const modCount = vehicles.reduce((sum, vehicle) => sum + vehicle.modifications.length, 0);

  return {
    totalCars,
    totalSpent: spent > 0 ? formatCurrency(spent) : "Pending",
    fastestCar: fastest ? `${fastest.mph} mph` : "Pending",
    fastestCarLabel: fastest ? `${fastest.vehicle.model.make.name} ${fastest.vehicle.model.name}` : "Specs not logged",
    modSpend: "$0",
    modDetail: modCount > 0 ? `${modCount} mods logged, costs not tracked` : "No mod costs logged",
  };
}

function parseMph(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 1000000 ? "compact" : "standard",
  }).format(value);
}
