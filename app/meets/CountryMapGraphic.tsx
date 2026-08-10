import type { ReactNode } from "react";

export function CountryMapGraphic({ countryCode, children }: { countryCode: "US"; children: ReactNode }) {
  const map = countryMapAssets[countryCode];

  return (
    <div className="meets-map-svg meets-real-map" role="img" aria-label={map.label}>
      <span className="meets-real-map-image" aria-hidden="true" style={{ backgroundImage: `url("${map.src}")` }} />
      {map.glows.map(([x, y]) => (
        <span key={`${x}:${y}`} className="meets-map-glow" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {children}
    </div>
  );
}

const countryMapAssets = {
  US: {
    label: "United States meet map",
    src: "/maps/us-contiguous-48.svg",
    glows: [
      [20.7, 14.4],
      [19.9, 55.4],
      [60.4, 37.7],
      [66, 60.9],
      [70.4, 55.3],
      [73.9, 82.5],
      [77.3, 36.3],
    ] as Array<[number, number]>,
  },
};
