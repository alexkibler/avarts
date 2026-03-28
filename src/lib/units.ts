export type UnitPreference = 'metric' | 'imperial';

/**
 * Format a distance value stored in kilometres.
 */
export function formatDistance(km: number, pref: UnitPreference): { value: string; unit: string } {
  if (pref === 'imperial') {
    return { value: (km * 0.621371).toFixed(2), unit: 'mi' };
  }
  return { value: km.toFixed(2), unit: 'km' };
}

/**
 * Format a speed value stored in km/h.
 */
export function formatSpeed(kmh: number, pref: UnitPreference): { value: string; unit: string } {
  if (pref === 'imperial') {
    return { value: (kmh * 0.621371).toFixed(2), unit: 'mph' };
  }
  return { value: kmh.toFixed(2), unit: 'km/h' };
}

/**
 * Format an elevation value stored in metres.
 */
export function formatElevation(meters: number, pref: UnitPreference): { value: string; unit: string } {
  if (pref === 'imperial') {
    return { value: Math.round(meters * 3.28084).toString(), unit: 'ft' };
  }
  return { value: Math.round(meters).toString(), unit: 'm' };
}

/**
 * Format a weight value stored in kilograms.
 */
export function formatWeight(kg: number, pref: UnitPreference): { value: string; unit: string } {
  if (pref === 'imperial') {
    return { value: (kg * 2.20462).toFixed(1), unit: 'lbs' };
  }
  return { value: kg.toFixed(1), unit: 'kg' };
}

/**
 * Convert a user-entered distance to kilometres for storage.
 * Input is assumed to be in the user's preferred unit.
 */
export function toStoredDistance(value: number, pref: UnitPreference): number {
  return pref === 'imperial' ? value * 1.60934 : value;
}

/**
 * Convert a user-entered elevation to metres for storage.
 * Input is assumed to be in the user's preferred unit.
 */
export function toStoredElevation(value: number, pref: UnitPreference): number {
  return pref === 'imperial' ? value / 3.28084 : value;
}
