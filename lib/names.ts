// Legal name parts as printed on a Philippine government ID
// (Last name, First name, Middle name). See 202609290002_legal_name_fields.sql.
export type LegalName = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
};

export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV'] as const;

export function cleanNamePart(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

// Free-text places ("makati  city") saved as "Makati City" so the same place
// isn't stored under different capitalizations.
export function normalizePlace(value: string) {
  return cleanNamePart(value)
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// The friendly name shown around the app; the middle name stays private.
export function displayNameFrom({ firstName, lastName, suffix }: LegalName) {
  return [firstName, lastName, suffix].map(cleanNamePart).filter(Boolean).join(' ');
}

// Returns an error message, or null when the name is complete.
export function validateLegalName(name: LegalName, noMiddleName: boolean) {
  if (!cleanNamePart(name.firstName) || !cleanNamePart(name.lastName)) {
    return 'Enter your first and last name as shown on your ID.';
  }
  if (!noMiddleName && !cleanNamePart(name.middleName)) {
    return "Enter your middle name, or tick \"I don't have a middle name\".";
  }
  return null;
}

// Column values for public.profiles.
export function legalNameColumns(name: LegalName, noMiddleName: boolean) {
  return {
    first_name: cleanNamePart(name.firstName),
    middle_name: noMiddleName ? null : cleanNamePart(name.middleName) || null,
    last_name: cleanNamePart(name.lastName),
    name_suffix: cleanNamePart(name.suffix) || null,
  };
}
