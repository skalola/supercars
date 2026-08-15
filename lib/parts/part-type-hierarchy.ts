import { toPartSlug } from "@/lib/parts/slug";

export type PartComponentGroup = { name: string; slug: string };

type GroupRule = PartComponentGroup & { pattern: RegExp };

const GROUP_RULES: Record<string, GroupRule[]> = {
  "maintenance-service": [
    group("Filters", /filter/i), group("Ignition Service", /spark|ignition/i), group("Belts", /belt/i),
    group("Battery Service", /battery/i), group("Fluids", /coolant|fluid/i), group("Service Kits", /kit/i), group("Visibility", /wiper/i),
  ],
  engine: [
    group("Engine Mounting", /mount/i), group("Gaskets & Seals", /gasket/i), group("Engine Sensors", /sensor/i),
    group("Pulleys & Tensioners", /pulley|tensioner/i), group("Engine Hoses", /hose/i), group("Engine Covers", /cover/i),
    group("Lubrication", /oil pan|oil pump/i),
  ],
  "air-induction": [
    group("Air Filters", /air filter/i), group("Airboxes & Intakes", /airbox|intake system|intake hose|carbon intake|cold air intake|short ram intake/i),
    group("Intake Manifolds", /intake manifold/i), group("Throttle", /throttle body/i), group("Forced Induction", /turbocharger|wastegate|boost controller|blow[- ]off/i),
    group("Charge Air", /charge pipe|intercooler|turbo inlet/i),
  ],
  "fuel-system": [
    group("Fuel Pumps", /fuel pump/i), group("Fuel Injection", /injector/i), group("Fuel Rails", /fuel rail/i),
    group("Fuel Sensors", /sensor/i), group("Fuel Lines & Tanks", /line|tank/i),
  ],
  cooling: [
    group("Radiators & Fans", /radiator|fan/i), group("Coolers & Heat Exchangers", /cooler|intercooler/i), group("Water Pumps & Thermostats", /water pump|thermostat/i),
    group("Cooling Hoses", /hose/i), group("Expansion & Reservoir Tanks", /tank|reservoir/i),
  ],
  "exhaust-emissions": [
    group("Exhaust Systems", /oem exhaust|performance exhaust|cat-back/i), group("Mufflers", /muffler/i), group("Headers & Manifolds", /header|manifold/i),
    group("Pipes", /downpipe|test pipe/i), group("Catalysts", /catalytic|catalyst/i), group("Exhaust Valves", /valve/i), group("Tips & Heat Shields", /tip|heat shield/i),
  ],
  "ecu-electronics": [
    group("Engine Control", /^ecu$|ecu tune|piggyback|power module/i), group("Transmission Control", /tcu|transmission controller/i), group("Sensors", /sensor/i),
    group("Control Modules", /control module/i), group("Power Distribution", /fuse|relay/i), group("Wiring", /wiring/i), group("Starting & Charging", /starter|alternator/i),
  ],
  "transmission-drivetrain": [
    group("Clutches & Flywheels", /clutch|flywheel/i), group("Transmission Mounting", /transmission mount/i), group("Gearbox & Shifting", /gearbox|shift/i),
    group("Differentials", /differential/i), group("Axles & CV Joints", /axle|cv joint/i),
  ],
  "suspension-steering": [
    group("Springs & Coilovers", /spring|coilover/i), group("Shocks & Dampers", /shock|damper/i), group("Control Arms & Joints", /control arm|ball joint/i),
    group("Bushings & Links", /bushing|sway bar|end link/i), group("Suspension Sensors", /ride height sensor/i), group("Steering", /tie rod|steering rack|steering sensor|power steering/i),
  ],
  brakes: [
    group("Brake Pads", /brake pads?/i), group("Brake Rotors", /brake rotors?|carbon ceramic rotor/i), group("Brake Calipers", /caliper/i),
    group("Brake Hydraulics", /brake line|brake hose|brake fluid/i), group("Brake Sensors", /wear sensor/i), group("Brake Kits", /brake kit/i),
  ],
  "wheels-tires": [
    group("Wheels", /wheel/i), group("Wheel Hardware", /bolt|nut|center cap|spacer/i), group("Tire Pressure Monitoring", /tpms/i), group("Tires", /tire/i),
  ],
  "body-exterior": [
    group("Bumpers", /bumper/i), group("Hoods & Deck Lids", /hood|deck lid/i), group("Fenders & Panels", /fender|panel/i),
    group("Doors", /door/i), group("Mirrors", /mirror/i), group("Grilles", /grille/i), group("Lightweight Body", /lightweight/i),
  ],
  aerodynamics: [
    group("Front Aero", /front splitter|front lip|canard/i), group("Rear Aero", /rear diffuser|rear wing|spoiler/i),
    group("Side Aero", /side skirt/i), group("Underbody Aero", /undertray/i), group("Aero Packages", /package/i),
  ],
  interior: [
    group("Seats", /seat/i), group("Driver Controls", /steering wheel|paddle shifter|pedal/i), group("Cabin Protection", /floor mat/i),
    group("Switches & Buttons", /switch|button/i), group("Interior Trim", /trim/i), group("Dashboard & Infotainment", /dashboard|infotainment/i),
  ],
  lighting: [group("Headlights", /headlight/i), group("Tail Lights", /tail light/i), group("Markers & Signals", /marker|turn signal/i), group("Interior Lighting", /interior light/i)],
  "accessories-care": [
    group("Vehicle Protection", /car cover/i), group("Charging", /battery tender/i), group("Garage & Display", /license plate frame/i),
    group("Tools", /tool kit/i), group("Luggage & Storage", /luggage|storage/i),
  ],
  "performance-packages": [group("Power Packages", /stage|power|exhaust.*ecu/i), group("Track Packages", /track/i)],
};

export function getUniversalPartComponentGroup(systemSlug: string, partTypeName: string, fallback?: string | null): PartComponentGroup {
  const matched = GROUP_RULES[systemSlug]?.find((rule) => rule.pattern.test(partTypeName));
  if (matched) return { name: matched.name, slug: matched.slug };
  const fallbackName = titleFromToken(fallback) || "Other Parts";
  return { name: fallbackName, slug: toPartSlug(fallbackName) };
}

function group(name: string, pattern: RegExp): GroupRule {
  return { name, slug: toPartSlug(name), pattern };
}

function titleFromToken(value?: string | null) {
  return value?.trim().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "";
}
