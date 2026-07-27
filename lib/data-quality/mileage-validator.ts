export type MileageValidationStatus = "COMPLETE" | "MISSING_MILEAGE" | "MILEAGE_CONFLICT";

/**
 * Validates mileage sanity and checks for chronologically impossible decreases.
 */
export function validateMileage(
  currentMileage: number | null,
  previousMileages: (number | null)[]
): {
  status: MileageValidationStatus;
  reason?: string;
} {
  // Sanity check: below 0
  if (currentMileage !== null && currentMileage < 0) {
    return { status: "MILEAGE_CONFLICT", reason: `Mileage cannot be negative: ${currentMileage}` };
  }

  // Sanity check: unrealistic mileage values (e.g. > 1,000,000)
  if (currentMileage !== null && currentMileage > 1000000) {
    return { status: "MILEAGE_CONFLICT", reason: `Unrealistic mileage value: ${currentMileage}` };
  }

  const validPrev = previousMileages.filter((m): m is number => m !== null && m >= 0);

  if (currentMileage === null) {
    if (validPrev.length > 0) {
      return { status: "MISSING_MILEAGE", reason: "Mileage is null on vehicle, but exists in listings" };
    }
    return { status: "MISSING_MILEAGE", reason: "Mileage is missing" };
  }

  // Check decreases between updates (if current is less than any previously tracked mileage)
  for (const prev of validPrev) {
    if (currentMileage < prev) {
      return {
        status: "MILEAGE_CONFLICT",
        reason: `Mileage decreased: current ${currentMileage} is less than historical ${prev}`
      };
    }
  }

  return { status: "COMPLETE" };
}
