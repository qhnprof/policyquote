import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { quoteRequestSchema, type QuoteRequest } from '../validation/quote-request.schema';

// A reproducible book of made-up customers for previewing KB changes (see impact.ts).
// The distribution lives in book-assumptions.json, not in code.

const weighted = <T extends z.ZodType>(value: T) =>
  z.array(z.strictObject({ value, weight: z.number().positive() })).min(1);

export const bookAssumptionsSchema = z.strictObject({
  description: z.string().optional(),
  ageBands: z
    .array(z.strictObject({ min: z.number().int(), max: z.number().int(), weight: z.number().positive() }))
    .min(1),
  propertyTypes: weighted(quoteRequestSchema.shape.propertyType),
  propertyValue: z.strictObject({
    median: z.number().positive(),
    logSpread: z.number().nonnegative(),
    min: z.number().positive(),
    max: z.number().positive(),
    roundTo: z.number().positive(),
  }),
  previousClaims: weighted(z.number().int().nonnegative()),
  postcodeDistricts: z.array(z.string().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]?$/)).min(1),
});
export type BookAssumptions = z.infer<typeof bookAssumptionsSchema>;

export const BOOK_ASSUMPTIONS_PATH = path.resolve(__dirname, 'book-assumptions.json');

export function loadBookAssumptions(filePath: string = BOOK_ASSUMPTIONS_PATH): BookAssumptions {
  return bookAssumptionsSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
}

/** mulberry32: a tiny, fast, seeded PRNG. Same seed, same sequence. Returns floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('pickWeighted needs at least one item');
  return last;
}

const pick = <T>(items: readonly T[], random: () => number): T => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick needs at least one item');
  return item;
};

const intBetween = (min: number, max: number, random: () => number): number =>
  min + Math.floor(random() * (max - min + 1));

/** Standard normal sample (Box–Muller). */
function normal(random: () => number): number {
  const u = 1 - random(); // (0, 1], so log(u) is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const INWARD_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ'; // Royal Mail inward codes never use C, I, K, M, O, V

/**
 * `size` made-up customers, all valid quote requests. Deterministic: the same seed and
 * assumptions always give the same book.
 */
export function generateBook(size: number, seed: number, assumptions: BookAssumptions = loadBookAssumptions()): QuoteRequest[] {
  if (!Number.isInteger(size) || size < 0) throw new Error(`Book size must be a whole number ≥ 0, got ${size}`);
  const random = createRandom(seed);
  const { propertyValue: pv } = assumptions;

  return Array.from({ length: size }, (_, index) => {
    const ageBand = pickWeighted(assumptions.ageBands, random);
    const rawValue = pv.median * Math.exp(pv.logSpread * normal(random));
    const value = Math.min(pv.max, Math.max(pv.min, Math.round(rawValue / pv.roundTo) * pv.roundTo));
    const district = pick(assumptions.postcodeDistricts, random);
    const inward = `${intBetween(0, 9, random)}${pick([...INWARD_LETTERS], random)}${pick([...INWARD_LETTERS], random)}`;

    return quoteRequestSchema.parse({
      customerName: `Customer ${String(index + 1).padStart(4, '0')}`,
      age: intBetween(ageBand.min, ageBand.max, random),
      propertyType: pickWeighted(assumptions.propertyTypes, random).value,
      propertyValue: value,
      postcode: `${district} ${inward}`,
      previousClaims: pickWeighted(assumptions.previousClaims, random).value,
    });
  });
}
