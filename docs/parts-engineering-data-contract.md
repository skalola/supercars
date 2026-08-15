# Parts Engineering Data Contract

Version: `1.0.0`

This contract is the shared boundary for vehicle profiles, part effects, constraint analysis, ranking, explanations, and the parts-page recommendation UI. Unknown values stay unknown; downstream services must not infer a precise numerical result from absent evidence.

## Canonical Units

- Power: horsepower (`hp`)
- Torque: pound-feet (`lb-ft`)
- Vehicle mass: pounds (`lb`)
- Power-to-weight: pounds per horsepower (`lb/hp`)
- Tire and brake dimensions: millimeters (`mm`) or inches (`inch`) as declared
- Temperature: degrees Fahrenheit (`fahrenheit`)
- Pressure: pounds per square inch (`psi`)
- Money: integer cents (`cents`)
- Ratios and percentages: explicit `ratio` or `percent`; never interchangeable

Source units must be converted before entering an engineering profile. The source value and conversion should remain available in evidence notes.

## Confidence

- `VERIFIED`: OEM, regulatory, or repeatable instrumented evidence directly matching the year/variant.
- `HIGH`: strong model-specific evidence with no material conflicts.
- `MEDIUM`: credible family-level or manufacturer evidence with a disclosed variant limitation.
- `LOW`: plausible but incomplete evidence; suitable only for qualitative guidance.
- `UNKNOWN`: no defensible evidence. Numerical claims are prohibited.

`VERIFIED` and `HIGH` measurements require at least one evidence identifier.

## Recommendation Order

1. Validate the exact vehicle and variant profile.
2. Apply hard compatibility and user constraints.
3. Identify the current limiting system.
4. Evaluate measurable benefits and supporting requirements.
5. Rank reliability and useful performance ahead of headline gains.
6. Explain evidence, tradeoffs, confidence, and missing data in plain language.

## Required Vehicle Knowledge

An engineering-complete variant has engine code, aspiration, horsepower, torque, weight, drivetrain, transmission, tire specification, brake specification, and thermal configuration. Missing values are returned by `auditVehicleEngineeringProfile` and must be disclosed to the user.

## Build Intentions

The supported intentions are street balanced, daily driver, track day, autocross, drag, touring, and show. Intent changes ranking, not compatibility facts. A user preference can never override a hard incompatibility.

## Constraints

The contract supports budget, legality, emissions, warranty, reliability, NVH, installation complexity, fuel availability, climate, and high-mileage constraints. Constraint findings are classified as hard blockers, warnings, or advisories.
