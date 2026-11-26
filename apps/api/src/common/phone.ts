/**
 * Canonical phone storage: digits only, with default country prefix for 10-digit locals.
 * Example IN: 9000000001 → 919000000001
 */
export function normalizePhone(
  phone: string,
  defaultCountry = '91',
): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && defaultCountry) {
    digits = `${defaultCountry}${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('INVALID_PHONE');
  }
  return digits;
}

/** Lookup keys: canonical + legacy 10-digit local (pre-normalization DBs). */
export function phoneLookupKeys(
  phone: string,
  defaultCountry = '91',
): string[] {
  const canonical = normalizePhone(phone, defaultCountry);
  const keys = [canonical];
  if (
    defaultCountry &&
    canonical.startsWith(defaultCountry) &&
    canonical.length === defaultCountry.length + 10
  ) {
    keys.push(canonical.slice(defaultCountry.length));
  }
  return [...new Set(keys)];
}
