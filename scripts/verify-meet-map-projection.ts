import { projectContiguousUsToPercent } from "@/lib/maps/us-projection";

const expectedCityWindows = [
  { city: "Seattle", latitude: 47.6062, longitude: -122.3321, x: [16, 25], y: [10, 20] },
  { city: "Los Angeles", latitude: 34.0522, longitude: -118.2437, x: [16, 24], y: [50, 61] },
  { city: "Chicago", latitude: 41.8781, longitude: -87.6298, x: [56, 65], y: [33, 43] },
  { city: "Charlotte", latitude: 35.2271, longitude: -80.8431, x: [66, 75], y: [50, 61] },
  { city: "Miami", latitude: 25.7617, longitude: -80.1918, x: [70, 78], y: [78, 88] },
  { city: "New York", latitude: 40.7128, longitude: -74.006, x: [73, 82], y: [31, 41] },
];

for (const city of expectedCityWindows) {
  const point = projectContiguousUsToPercent(city.latitude, city.longitude);
  const withinX = point.x >= city.x[0] && point.x <= city.x[1];
  const withinY = point.y >= city.y[0] && point.y <= city.y[1];

  if (!withinX || !withinY) {
    throw new Error(
      `${city.city} projected outside expected map window: ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%`,
    );
  }

  console.log(`${city.city}: ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%`);
}
