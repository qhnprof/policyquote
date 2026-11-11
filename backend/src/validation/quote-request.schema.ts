import { z } from 'zod';

/** UK postcode without spaces, e.g. "EX41AA", "SW1A1AA", "M11AE". */
const UK_POSTCODE_COMPACT = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
/** The inward code (e.g. "1AA") is always the last three characters. */
const INWARD_CODE_LENGTH = 3;

/** Accepts any spacing or case and normalises to the Royal Mail format: "ex4 1aa" → "EX4 1AA". */
export const postcodeSchema = z
  .string()
  .transform((raw) => raw.toUpperCase().replace(/\s+/g, ''))
  .refine((compact) => UK_POSTCODE_COMPACT.test(compact), { message: 'Must be a valid UK postcode' })
  .transform(
    (compact) => `${compact.slice(0, -INWARD_CODE_LENGTH)} ${compact.slice(-INWARD_CODE_LENGTH)}`,
  );

export const quoteRequestSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  age: z.number().int().min(18).max(120),
  propertyType: z.enum(['House', 'Flat', 'Bungalow']),
  propertyValue: z.number().positive().max(50_000_000),
  postcode: postcodeSchema,
  previousClaims: z.number().int().min(0).max(20),
});

/** A validated, normalised quote request. */
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** The request field names. The KB schema derives its allowed `field` values from this. */
export const quoteRequestFieldSchema = quoteRequestSchema.keyof();
export type QuoteRequestField = z.infer<typeof quoteRequestFieldSchema>;
export const QUOTE_REQUEST_FIELDS = quoteRequestFieldSchema.options;
