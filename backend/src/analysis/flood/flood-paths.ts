import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_KB_PATH } from '../../kb/kb-loader';

/** The repository root (the folder holding kb/ and data/). */
export const REPO_ROOT = path.resolve(DEFAULT_KB_PATH, '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');

export const floodSourceSchema = z.strictObject({
  title: z.string(),
  publisher: z.string(),
  url: z.url(),
  downloadUrl: z.url(),
  file: z.string(),
  licence: z.string(),
  licenceUrl: z.url(),
  revisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverage: z.string(),
  attribution: z.array(z.string()).min(1),
  riskBands: z.record(z.string(), z.string()),
  caveats: z.array(z.string()),
});
export type FloodSource = z.infer<typeof floodSourceSchema>;

/** data/flood-source.json: where the flood data comes from, its date, licence and required attribution. */
export function loadFloodSource(file: string = path.join(DATA_DIR, 'flood-source.json')): FloodSource {
  return floodSourceSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
