/**
 * Unit conversion and formatting. Everything is stored in cm; this is only
 * for what the user sees and types.
 */
export type UnitSystem = 'metric' | 'imperial';

export const CM_PER_INCH = 2.54;

/** Format a length for display, e.g. 160 -> "160 cm" or "5′ 3″". */
export function formatLength(cm: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const totalInches = Math.round(cm / CM_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  if (feet === 0) return `${inches}″`;
  return inches === 0 ? `${feet}′` : `${feet}′ ${inches}″`;
}

/** Number shown in an input box: cm in metric, inches (1 decimal) in imperial. */
export function toInputValue(cm: number, units: UnitSystem): number {
  return units === 'metric' ? Math.round(cm) : Math.round((cm / CM_PER_INCH) * 10) / 10;
}

/** Convert what the user typed back to cm. */
export function fromInputValue(value: number, units: UnitSystem): number {
  return units === 'metric' ? value : value * CM_PER_INCH;
}

export const unitSuffix = (units: UnitSystem): string => (units === 'metric' ? 'cm' : 'in');
