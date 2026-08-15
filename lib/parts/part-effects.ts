import { z } from "zod";
import {
  BUILD_INTENTIONS,
  ENGINEERING_CONFIDENCE_LEVELS,
  PERFORMANCE_DIMENSIONS,
  type BuildIntention,
  type PerformanceDimension,
} from "./engineering-contract";

const effectBenefitSchema = z.object({
  dimension: z.enum(PERFORMANCE_DIMENSIONS),
  direction: z.enum(["INCREASE", "DECREASE", "SUPPORT"]),
  summary: z.string().min(1).max(300),
  measurable: z.boolean(),
});

const effectTradeoffSchema = z.object({
  code: z.string().min(1).max(80),
  dimension: z.enum(PERFORMANCE_DIMENSIONS).nullable(),
  summary: z.string().min(1).max(300),
});

const effectDependencySchema = z.object({
  systemSlug: z.string().min(1).max(100),
  level: z.enum(["REQUIRED", "RECOMMENDED", "CONDITIONAL"]),
  condition: z.string().min(1).max(300),
  reason: z.string().min(1).max(300),
});

const effectRiskSchema = z.object({
  code: z.string().min(1).max(80),
  dimension: z.enum(PERFORMANCE_DIMENSIONS),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string().min(1).max(300),
});

export const partEngineeringEffectSchema = z.object({
  contractVersion: z.literal("1.0.0"),
  primaryDimension: z.enum(PERFORMANCE_DIMENSIONS),
  benefits: z.array(effectBenefitSchema).min(1),
  tradeoffs: z.array(effectTradeoffSchema).min(1),
  dependencies: z.array(effectDependencySchema),
  risks: z.array(effectRiskSchema).min(1),
  buildIntentions: z.array(z.enum(BUILD_INTENTIONS)).min(1),
  confidence: z.enum(ENGINEERING_CONFIDENCE_LEVELS),
  evidenceBasis: z.string().min(1).max(500),
});
export type PartEngineeringEffectDefinition = z.infer<typeof partEngineeringEffectSchema>;

type EffectRule = Omit<PartEngineeringEffectDefinition, "contractVersion" | "confidence" | "evidenceBasis">;

const STREET_ALL: BuildIntention[] = ["STREET_BALANCED", "DAILY_DRIVER", "TOURING"];
const PERFORMANCE_ALL: BuildIntention[] = ["STREET_BALANCED", "TRACK_DAY", "AUTOCROSS", "DRAG"];

export const SYSTEM_EFFECT_RULES: Record<string, EffectRule> = {
  "maintenance-service": rule("RELIABILITY", benefit("RELIABILITY", "SUPPORT", "Restores or preserves the vehicle's intended operating condition."), trade("SERVICE_INTERVAL", "RELIABILITY", "Requires recurring inspection or replacement."), risk("DEFERRED_SERVICE", "RELIABILITY", "HIGH", "Skipping the related service can increase wear or failure risk."), STREET_ALL),
  engine: rule("RELIABILITY", benefit("RELIABILITY", "SUPPORT", "Supports engine sealing, lubrication, mounting, or mechanical operation."), trade("INSTALL_ACCESS", null, "Installation may require substantial engine-bay access and labor."), risk("ASSEMBLY_ERROR", "RELIABILITY", "HIGH", "Incorrect installation can create leaks, vibration, or engine damage."), PERFORMANCE_ALL),
  "air-induction": rule("POWER", benefit("POWER", "SUPPORT", "Can improve available airflow and engine response when the calibration can use it."), trade("INDUCTION_NOISE", null, "May increase induction sound or cabin noise."), risk("FILTRATION_OR_METERING", "RELIABILITY", "MEDIUM", "Poor filtration or incorrect airflow metering can reduce reliability."), PERFORMANCE_ALL),
  "fuel-system": rule("POWER", benefit("POWER", "SUPPORT", "Supports fuel delivery capacity for the requested engine output."), trade("CALIBRATION_REQUIRED", null, "Capacity changes may require calibration and fuel-system setup."), risk("LEAN_OR_RICH_OPERATION", "RELIABILITY", "HIGH", "Incorrect sizing or calibration can produce unsafe fueling."), PERFORMANCE_ALL),
  cooling: rule("THERMAL_CAPACITY", benefit("THERMAL_CAPACITY", "INCREASE", "Adds heat-rejection capacity or improves temperature stability."), trade("MASS_AND_COMPLEXITY", "MASS", "Additional cooling hardware can add mass, fluid volume, and complexity."), risk("LEAK_OR_AIRLOCK", "RELIABILITY", "MEDIUM", "Incorrect installation or bleeding can cause leaks or inadequate cooling."), ["STREET_BALANCED", "DAILY_DRIVER", "TRACK_DAY", "AUTOCROSS", "DRAG", "TOURING"]),
  "exhaust-emissions": rule("POWER", benefit("POWER", "SUPPORT", "Can reduce exhaust restriction and support engine response."), trade("NOISE_EMISSIONS", null, "May increase sound and affect emissions compliance."), risk("HEAT_OR_COMPLIANCE", "THERMAL_CAPACITY", "MEDIUM", "Exhaust changes can alter heat exposure and legal compliance."), PERFORMANCE_ALL),
  "ecu-electronics": rule("POWER", benefit("POWER", "INCREASE", "Can coordinate engine controls and unlock documented hardware capability."), trade("FUEL_AND_WARRANTY", null, "May require higher-octane fuel and can affect warranty coverage."), risk("CALIBRATION_MARGIN", "RELIABILITY", "HIGH", "Aggressive or mismatched calibration can reduce engine and drivetrain safety margins."), PERFORMANCE_ALL),
  "transmission-drivetrain": rule("DRIVETRAIN_CAPACITY", benefit("DRIVETRAIN_CAPACITY", "INCREASE", "Can improve torque capacity, power delivery, or differential control."), trade("NVH_AND_DRIVABILITY", null, "May increase noise, vibration, shift effort, or low-speed harshness."), risk("SHOCK_LOAD", "DRIVETRAIN_CAPACITY", "HIGH", "Incorrect matching can increase shock loads or accelerate driveline wear."), PERFORMANCE_ALL),
  "suspension-steering": rule("HANDLING", benefit("HANDLING", "INCREASE", "Can improve body control, response, and alignment control."), trade("RIDE_QUALITY", null, "May reduce ride comfort or increase road noise and harshness."), risk("ALIGNMENT_OR_TRAVEL", "HANDLING", "MEDIUM", "Incorrect geometry or insufficient travel can reduce grip and tire life."), ["STREET_BALANCED", "TRACK_DAY", "AUTOCROSS", "TOURING", "SHOW"]),
  brakes: rule("BRAKING", benefit("BRAKING", "INCREASE", "Can improve repeatability, pedal consistency, or heat capacity."), trade("DUST_NOISE_WEAR", null, "Higher-performance friction materials may add dust, noise, or rotor wear."), risk("BRAKE_BALANCE", "BRAKING", "HIGH", "Mismatched components or poor bedding can reduce braking consistency."), ["STREET_BALANCED", "DAILY_DRIVER", "TRACK_DAY", "AUTOCROSS", "DRAG", "TOURING"]),
  "wheels-tires": rule("TRACTION", benefit("TRACTION", "INCREASE", "Can improve usable grip, steering response, and power delivery."), trade("WEAR_RIDE_COST", null, "More aggressive fitments may increase wear, cost, noise, or ride harshness."), risk("LOAD_OR_CLEARANCE", "TRACTION", "HIGH", "Incorrect size, load rating, offset, or clearance can be unsafe."), ["STREET_BALANCED", "DAILY_DRIVER", "TRACK_DAY", "AUTOCROSS", "DRAG", "TOURING", "SHOW"]),
  "body-exterior": rule("MASS", benefit("MASS", "DECREASE", "Lightweight or replacement body components can reduce mass or restore exterior integrity."), trade("FIT_FINISH", null, "Aftermarket panels may require additional fitment and finish work."), risk("STRUCTURAL_OR_SENSOR", "RELIABILITY", "MEDIUM", "Incorrect body changes can affect mounting, sensors, or crash-related systems."), ["STREET_BALANCED", "TRACK_DAY", "AUTOCROSS", "DRAG", "SHOW"]),
  aerodynamics: rule("AERODYNAMICS", benefit("AERODYNAMICS", "INCREASE", "Can improve high-speed stability or aerodynamic balance when configured as a system."), trade("DRAG_CLEARANCE", null, "May increase drag, reduce clearance, or change balance at speed."), risk("AERO_IMBALANCE", "HANDLING", "HIGH", "An isolated aero change can shift balance and reduce stability."), ["STREET_BALANCED", "TRACK_DAY", "AUTOCROSS", "SHOW"]),
  interior: rule("MASS", benefit("MASS", "DECREASE", "Driver-interface or lightweight interior changes can improve control or reduce mass."), trade("COMFORT_ACCESS", null, "May reduce comfort, convenience, or ease of entry."), risk("RESTRAINT_COMPATIBILITY", "RELIABILITY", "HIGH", "Seat, wheel, or restraint changes must preserve compatible safety systems."), ["STREET_BALANCED", "DAILY_DRIVER", "TRACK_DAY", "AUTOCROSS", "DRAG", "TOURING", "SHOW"]),
  lighting: rule("RELIABILITY", benefit("RELIABILITY", "SUPPORT", "Restores or improves vehicle visibility and signaling."), trade("ELECTRICAL_COMPATIBILITY", null, "Electrical or control-module compatibility may require coding or adapters."), risk("GLARE_OR_FAULT", "RELIABILITY", "MEDIUM", "Incorrect optics or electronics can create glare, faults, or poor visibility."), ["STREET_BALANCED", "DAILY_DRIVER", "TOURING", "SHOW"]),
  "accessories-care": rule("RELIABILITY", benefit("RELIABILITY", "SUPPORT", "Supports storage, protection, charging, or routine vehicle care."), trade("NO_DIRECT_GAIN", null, "Usually provides protection or convenience rather than measurable performance."), risk("MISUSE_OR_FITMENT", "RELIABILITY", "LOW", "Incorrect use or fitment can damage finishes, electrical systems, or mounting points."), ["STREET_BALANCED", "DAILY_DRIVER", "TOURING", "SHOW"]),
  "performance-packages": rule("POWER", benefit("POWER", "INCREASE", "Coordinates multiple systems into a defined upgrade path."), trade("SYSTEM_COST_COMPLEXITY", null, "Package-level upgrades increase cost, installation scope, and calibration complexity."), risk("UNBALANCED_PACKAGE", "RELIABILITY", "HIGH", "A package without its required supporting systems can exceed thermal or drivetrain limits."), PERFORMANCE_ALL),
};

export function buildPartEngineeringEffect(input: { categorySlug: string; componentName: string }): PartEngineeringEffectDefinition {
  const base = SYSTEM_EFFECT_RULES[input.categorySlug] ?? SYSTEM_EFFECT_RULES["accessories-care"];
  const specialized = specialize(base, `${input.componentName} ${input.categorySlug}`.toLowerCase());
  return partEngineeringEffectSchema.parse({
    contractVersion: "1.0.0",
    ...specialized,
    confidence: "LOW",
    evidenceBasis: "System-level engineering baseline. Exact numerical effects require vehicle-, variant-, and part-specific evidence.",
  });
}

function specialize(base: EffectRule, name: string): EffectRule {
  const dependencies = [...base.dependencies];
  const risks = [...base.risks];
  const tradeoffs = [...base.tradeoffs];
  let benefits = [...base.benefits];
  let primaryDimension = base.primaryDimension;

  if (/turbocharger|supercharger|forced induction/.test(name)) {
    primaryDimension = "POWER";
    benefits = [benefit("POWER", "INCREASE", "Raises airflow and potential engine output when fuel, calibration, and thermal systems are matched.")];
    dependencies.push(
      dependency("fuel-system", "REQUIRED", "Whenever boost or airflow exceeds the verified factory fuel capacity.", "Prevents fuel delivery from becoming the limiting system."),
      dependency("ecu-electronics", "REQUIRED", "Whenever forced-induction hardware changes airflow or boost.", "Coordinates boost, fuel, ignition, and safety controls."),
      dependency("cooling", "REQUIRED", "For sustained higher-load use.", "Manages additional charge, oil, and coolant heat."),
      dependency("transmission-drivetrain", "CONDITIONAL", "When projected torque approaches the verified drivetrain capacity.", "Prevents torque capacity from becoming a hard constraint."),
    );
    risks.push(risk("BOOST_SYSTEM_OVERLOAD", "RELIABILITY", "HIGH", "Unsupported boost can exceed engine, fuel, thermal, or drivetrain limits."));
  } else if (/ecu tune|piggyback|power module|engine control/.test(name)) {
    dependencies.push(
      dependency("fuel-system", "CONDITIONAL", "When calibration requires more fuel flow or a different fuel grade.", "Maintains commanded air-fuel targets."),
      dependency("cooling", "CONDITIONAL", "When sustained load or output rises materially.", "Preserves thermal safety margin."),
    );
  } else if (/downpipe|test pipe|header|exhaust manifold/.test(name)) {
    dependencies.push(dependency("ecu-electronics", "CONDITIONAL", "When exhaust flow or sensor behavior differs from the verified calibration.", "Maintains safe control and diagnostic behavior."));
    risks.push(risk("EMISSIONS_NONCOMPLIANCE", "RELIABILITY", "HIGH", "Some configurations may not be emissions compliant or street legal."));
  } else if (/coilover|spring|control arm|sway bar|tie rod/.test(name)) {
    dependencies.push(dependency("wheels-tires", "RECOMMENDED", "After any geometry or ride-height change.", "Alignment and tire condition determine whether chassis changes produce usable grip."));
  } else if (/brake pad|brake rotor|brake kit|caliper/.test(name)) {
    dependencies.push(dependency("wheels-tires", "RECOMMENDED", "When braking capacity exceeds available tire grip.", "The tire ultimately transmits braking force to the road."));
  }

  return { ...base, primaryDimension, benefits, tradeoffs, dependencies: dedupe(dependencies, (item) => `${item.systemSlug}:${item.level}`), risks: dedupe(risks, (item) => item.code) };
}

function rule(primaryDimension: PerformanceDimension, primaryBenefit: ReturnType<typeof benefit>, primaryTradeoff: ReturnType<typeof trade>, primaryRisk: ReturnType<typeof risk>, buildIntentions: BuildIntention[]): EffectRule {
  return { primaryDimension, benefits: [primaryBenefit], tradeoffs: [primaryTradeoff], dependencies: [], risks: [primaryRisk], buildIntentions };
}
function benefit(dimension: PerformanceDimension, direction: "INCREASE" | "DECREASE" | "SUPPORT", summary: string) { return { dimension, direction, summary, measurable: false } as const; }
function trade(code: string, dimension: PerformanceDimension | null, summary: string) { return { code, dimension, summary }; }
function risk(code: string, dimension: PerformanceDimension, severity: "LOW" | "MEDIUM" | "HIGH", summary: string) { return { code, dimension, severity, summary }; }
function dependency(systemSlug: string, level: "REQUIRED" | "RECOMMENDED" | "CONDITIONAL", condition: string, reason: string) { return { systemSlug, level, condition, reason }; }
function dedupe<T>(values: T[], key: (value: T) => string) { return [...new Map(values.map((value) => [key(value), value])).values()]; }
