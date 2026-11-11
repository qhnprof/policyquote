// Postcode fields derived from the normalised postcode, so KB rules can match whole areas and
// districts exactly instead of by prefix (a prefix "E" would also match "EX4 1AA"; "B1" would
// also match "B10 0AA"). This is the only place they are derived. They are not form fields and
// not part of the API request.

/** The inward code (e.g. "1AA") is always the last three characters of a full postcode. */
const INWARD_CODE_LENGTH = 3;

/** A UK outward code (postcode district): "EX4", "SW1A", "M1", "E1W". */
export const UK_OUTWARD_CODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;

export interface PostcodeFields {
  /** The leading letters: "EX" for "EX4 1AA", "E" for "E1 6AN". */
  postcodeArea: string;
  /** The outward code, the part before the space: "EX4" for "EX4 1AA", "SW1A" for "SW1A 1AA". */
  postcodeDistrict: string;
}

export const DERIVED_POSTCODE_FIELDS = ['postcodeArea', 'postcodeDistrict'] as const;
export type DerivedPostcodeField = (typeof DERIVED_POSTCODE_FIELDS)[number];

/** The request field the derived fields come from. */
export const DERIVED_POSTCODE_SOURCE = 'postcode';

export const isDerivedPostcodeField = (field: string): field is DerivedPostcodeField =>
  DERIVED_POSTCODE_FIELDS.some((derived) => derived === field);

/**
 * Area and district for a postcode in any case or spacing. A string too short to hold an inward
 * code (e.g. the prefix "EX") is treated as an outward code on its own.
 */
export function derivePostcodeFields(postcode: string): PostcodeFields {
  const compact = postcode.toUpperCase().replace(/\s+/g, '');
  const postcodeDistrict = compact.length > INWARD_CODE_LENGTH ? compact.slice(0, -INWARD_CODE_LENGTH) : compact;
  const postcodeArea = /^[A-Z]+/.exec(postcodeDistrict)?.[0] ?? '';
  return { postcodeArea, postcodeDistrict };
}

/**
 * A representative postcode for a value of a derived field, used by the KB linter to probe
 * rules on areas and districts through the same derivation as real requests.
 */
export const SAMPLE_POSTCODE_FOR: Readonly<Record<DerivedPostcodeField, (value: string) => string>> = {
  postcodeArea: (area) => `${area}1 1AA`,
  postcodeDistrict: (district) => `${district} 1AA`,
};
