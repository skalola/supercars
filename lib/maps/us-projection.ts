export type MapPoint = {
  x: number;
  y: number;
};

type MapFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const US_MAP_FRAME: MapFrame = {
  left: 6.5,
  top: 8,
  width: 87,
  height: 82,
};

export function projectContiguousUsToPercent(latitude: number, longitude: number): MapPoint {
  const projected = projectAlbersUsa(latitude, longitude);
  const normalizedX = (projected.x - US_ALBERS_EXTENT.minX) / (US_ALBERS_EXTENT.maxX - US_ALBERS_EXTENT.minX);
  const normalizedY = 1 - ((projected.y - US_ALBERS_EXTENT.minY) / (US_ALBERS_EXTENT.maxY - US_ALBERS_EXTENT.minY));

  return {
    x: clamp(US_MAP_FRAME.left + normalizedX * US_MAP_FRAME.width, US_MAP_FRAME.left, US_MAP_FRAME.left + US_MAP_FRAME.width),
    y: clamp(US_MAP_FRAME.top + normalizedY * US_MAP_FRAME.height, US_MAP_FRAME.top, US_MAP_FRAME.top + US_MAP_FRAME.height),
  };
}

function projectAlbersUsa(latitude: number, longitude: number) {
  const radians = Math.PI / 180;
  const phi1 = 29.5 * radians;
  const phi2 = 45.5 * radians;
  const phi0 = 23 * radians;
  const lambda0 = -96 * radians;
  const phi = latitude * radians;
  const lambda = longitude * radians;
  const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const c = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
  const theta = n * (lambda - lambda0);
  const rho = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(phi0)) / n;

  return {
    x: rho * Math.sin(theta),
    y: rho0 - rho * Math.cos(theta),
  };
}

const US_ALBERS_EXTENT = (() => {
  const points: Array<{ x: number; y: number }> = [];
  for (let latitude = 24.4; latitude <= 49.4; latitude += 0.5) {
    for (let longitude = -124.8; longitude <= -66.9; longitude += 0.5) {
      points.push(projectAlbersUsa(latitude, longitude));
    }
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
})();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
