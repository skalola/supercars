export type PartsApiVehicle = { makeSlug: string; modelSlug: string };

export function getPartSystemsApiPath(vehicle: PartsApiVehicle, input?: { vehicleId?: string | null }) {
  const path = `/api/parts/vehicles/${segment(vehicle.makeSlug)}/${segment(vehicle.modelSlug)}/systems`;
  if (!input?.vehicleId) return path;
  return `${path}?${new URLSearchParams({ vehicleId: input.vehicleId })}`;
}

export function getPartTypesApiPath(vehicle: PartsApiVehicle, systemSlug: string) {
  return `${getPartSystemsApiPath(vehicle)}/${segment(systemSlug)}/part-types`;
}

export function getPartOffersApiPath(
  vehicle: PartsApiVehicle,
  input: { systemSlug: string; partTypeSlug: string; year?: number | null },
) {
  const params = new URLSearchParams({ system: input.systemSlug });
  if (input.year) params.set("year", String(input.year));
  return `/api/parts/vehicles/${segment(vehicle.makeSlug)}/${segment(vehicle.modelSlug)}/part-types/${segment(input.partTypeSlug)}/offers?${params}`;
}

export function getPartTypeDetailPath(
  vehicle: PartsApiVehicle,
  input: { systemSlug: string; partTypeSlug: string; year?: number | null; vehicleId?: string | null },
) {
  const params = new URLSearchParams({ system: input.systemSlug });
  if (input.year) params.set("year", String(input.year));
  if (input.vehicleId) params.set("vehicleId", input.vehicleId);
  return `/parts/vehicles/${segment(vehicle.makeSlug)}/${segment(vehicle.modelSlug)}/${segment(input.partTypeSlug)}?${params}`;
}

function segment(value: string) {
  return encodeURIComponent(value.trim().toLowerCase());
}
