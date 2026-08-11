export type GarageStatsVehicle = {
  vin: string;
  model: { name: string; make: { name: string }; spec: { horsepower: string | null; topSpeed: string | null } | null };
  modifications: unknown[];
  listings: Array<{ askingPrice: number | null; price: number | null }>;
};

export function getGarageStats(vehicles: GarageStatsVehicle[], totalCars: number) {
  const valuedVehicles = vehicles
    .map((vehicle) => ({
      vehicle,
      value: vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? 0,
    }))
    .filter((item) => item.value > 0);
  const spent = valuedVehicles.reduce((sum, item) => sum + item.value, 0);
  const mostValuable = valuedVehicles.sort((a, b) => b.value - a.value)[0] ?? null;
  const fastest = vehicles
    .map((vehicle) => ({ vehicle, hp: parseHorsepower(vehicle.model.spec?.horsepower) }))
    .filter((item): item is { vehicle: GarageStatsVehicle; hp: number } => item.hp !== null)
    .sort((a, b) => b.hp - a.hp)[0];
  const modCount = vehicles.reduce((sum, vehicle) => sum + vehicle.modifications.length, 0);

  return {
    totalCars,
    totalCollectionValue: spent > 0 ? formatCurrency(spent) : "Not enough data",
    totalSpent: spent > 0 ? formatCurrency(spent) : "Pending",
    mostValuable: mostValuable ? mostValuable.vehicle.model.name : "Not enough data",
    mostValuableLabel: mostValuable ? formatCurrency(mostValuable.value) : "Needs market data",
    mostValuableHref: mostValuable ? `/vehicle/${mostValuable.vehicle.vin}` : null,
    fastestCar: fastest ? fastest.vehicle.model.name : "Not enough data",
    fastestCarPower: fastest ? `${fastest.hp.toLocaleString()} hp` : "Specs not logged",
    fastestCarLabel: fastest ? `${fastest.vehicle.model.make.name} ${fastest.vehicle.model.name}` : "Specs not logged",
    fastestCarHref: fastest ? `/vehicle/${fastest.vehicle.vin}` : null,
    modSpend: "$0",
    modDetail: modCount > 0 ? `${modCount} mods logged, costs not tracked` : "No mod costs logged",
  };
}

function parseHorsepower(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d{2,4})/);
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
