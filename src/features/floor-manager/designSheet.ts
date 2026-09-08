import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { getSwatch, SWATCHES } from '../../data/swatches';
import type { NeedleEntry } from '../../data/types';

/**
 * The app's half of the design-sheet read.
 *
 * The extractor itself lives in `supabase/functions/extract-design-sheet`,
 * because the API key cannot ship inside a React Native bundle. This file owns
 * everything that happens either side of that call: getting the photo into
 * storage, parsing what comes back, and deciding what the result is allowed to
 * do to a job card.
 *
 * The last part is the important one. Every value here is a *proposal*. A
 * stitch count drives thread purchasing and machine time, so nothing below
 * writes to the job card on its own — `applyToNeedles` returns a new array and
 * a report of what it did and did not match, and the floor manager confirms it
 * against the paper still in their hand.
 */

/**
 * Parsed at the boundary, like every other read in this app.
 *
 * The edge function builds this shape from its own Zod schema, in a different
 * runtime with no shared module between them. That duplication is the reason
 * this parse is not optional: a field renamed on one side has to fail here,
 * visibly, rather than arrive as `undefined` three screens later.
 */
const extractedColorSchema = z.object({
  sequence: z.number().int(),
  name: z.string(),
  palette_match: z.string(),
  thread_code: z.string().nullable(),
  stitches: z.number().int().nullable(),
});

export const designSheetExtractionSchema = z.object({
  design_code: z.string().nullable(),
  design_name: z.string().nullable(),
  total_stitches: z.number().int().nullable(),
  width_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  colors: z.array(extractedColorSchema),
  raw_text: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string().nullable(),
  source_photo_path: z.string(),
  model: z.string(),
  extracted_at: z.string(),
});

export type DesignSheetExtraction = z.infer<typeof designSheetExtractionSchema>;
export type ExtractedColor = z.infer<typeof extractedColorSchema>;

const responseSchema = z.object({
  extraction: designSheetExtractionSchema,
  saved: z.boolean(),
  saveError: z.string().nullable(),
});

/**
 * Photograph a sheet and read it.
 *
 * The photo is uploaded first and the function is handed a path rather than the
 * image bytes. Two reasons: the sheet is then durable, so a re-parse after a bad
 * read never sends the floor manager back to the client for the paper; and the
 * function fetches it as the caller, which makes storage's own RLS the thing
 * that decides whether this person may have this order's sheet read.
 */
export async function extractDesignSheet(
  factoryId: string,
  orderId: string,
  photoUri: string,
): Promise<{ extraction: DesignSheetExtraction; saved: boolean }> {
  const path = await uploadPhoto({
    bucket: BUCKETS.jobCardPhotos,
    factoryId,
    uri: photoUri,
    name: `design-sheet-${orderId}`,
  });

  const { data, error } = await supabase.functions.invoke('extract-design-sheet', {
    body: { orderId, photoPath: path },
  });

  if (error) {
    // `FunctionsHttpError` carries the function's own JSON body, which is where
    // the useful half of the message lives — the generic wrapper just says the
    // call was non-2xx.
    const detail = await readFunctionError(error);
    throw new Error(detail ?? error.message);
  }

  const parsed = responseSchema.parse(data);
  return { extraction: parsed.extraction, saved: parsed.saved };
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}

// --- Turning an extraction into needle rows ---------------------------------

export interface NeedleProposal {
  /** The rows to show, in the order the sheet gives. */
  needles: NeedleEntry[];
  /** Colour ids whose stitch count came off the sheet and still needs confirming. */
  proposedColorIds: string[];
  /** Colours on the sheet that no sheet on this order uses. */
  unmatched: ExtractedColor[];
  /** Colours on the order the sheet said nothing about. */
  missing: string[];
}

/**
 * Fold an extraction into the needle rows the job card already has.
 *
 * Deliberately does **not** add rows. The order's own sheets decide which
 * colours are being embroidered — that comes from what QA passed — while the
 * design sheet is the client's reference for how. A colour on the paper that no
 * sheet on this order uses is a discrepancy worth showing the floor manager, not
 * a row to quietly create: it usually means the client brought the sheet for a
 * different order, and inventing a needle for it would put thread on a purchase
 * request nobody asked for.
 *
 * Needle numbers follow the sheet's stitch sequence where a colour matched,
 * because that sequence is how the machine will actually be threaded. Colours
 * the sheet never mentioned keep the number they had.
 */
export function applyToNeedles(
  needles: NeedleEntry[],
  extraction: DesignSheetExtraction,
): NeedleProposal {
  const byColor = new Map<string, ExtractedColor>();
  for (const color of extraction.colors) {
    // First mention wins: a sheet listing the same colour twice is running it
    // on two needles, and the first is the one the sequence starts from.
    if (!byColor.has(color.palette_match)) byColor.set(color.palette_match, color);
  }

  const proposedColorIds: string[] = [];
  const missing: string[] = [];

  const updated = needles.map((entry) => {
    const match = byColor.get(entry.color_id);
    if (!match || match.stitches === null) {
      missing.push(entry.color_id);
      return entry;
    }
    proposedColorIds.push(entry.color_id);
    return { ...entry, needle: match.sequence, stitches: match.stitches };
  });

  const orderColorIds = new Set(needles.map((entry) => entry.color_id));
  const unmatched = extraction.colors.filter(
    (color) => !orderColorIds.has(color.palette_match),
  );

  return { needles: updated, proposedColorIds, unmatched, missing };
}

// --- Cross-checks -----------------------------------------------------------

export interface StitchCheck {
  /** Sum of the per-colour counts the sheet gave. */
  sum: number;
  /** The total the sheet printed, when it printed one. */
  total: number | null;
  /** True when both exist and disagree. */
  mismatch: boolean;
}

/**
 * Does the colour breakdown add up to the total the sheet claims?
 *
 * The single most useful signal the sheet carries about its own reading. A
 * misread digit in one colour shows up here and nowhere else — the individual
 * number looks perfectly plausible on its own, and only the sum gives it away.
 * Exact, not tolerant: these are counts of stitches, and a sheet whose own
 * arithmetic is off by forty is a sheet worth a second look either way.
 */
export function checkStitchTotal(extraction: DesignSheetExtraction): StitchCheck {
  const sum = extraction.colors.reduce((running, color) => running + (color.stitches ?? 0), 0);
  const total = extraction.total_stitches;
  return { sum, total, mismatch: total !== null && total !== sum };
}

/** `180 × 240 mm`, or null when the sheet gave no size. */
export function formatSize(extraction: DesignSheetExtraction): string | null {
  const { width_mm: width, height_mm: height } = extraction;
  if (width === null || height === null) return null;
  return `${round(width)} × ${round(height)} mm`;
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The colour's display name for the confirm list.
 *
 * Shows the palette colour and, when the sheet called it something else, what
 * the sheet actually said — "Royal (Peacock 1042)". The floor manager is
 * checking this against the paper, so the paper's own wording has to be on
 * screen or there is nothing to check against.
 */
export function colorLabel(color: ExtractedColor): string {
  const swatch = getSwatch(color.palette_match);
  const paletteName = swatch?.label ?? 'Custom';
  const sheetName = color.name.trim();
  if (!sheetName || sheetName.toLowerCase() === paletteName.toLowerCase()) return paletteName;
  return `${paletteName} (${sheetName})`;
}

/**
 * Guard against the two palettes drifting apart.
 *
 * The edge function hardcodes the same ten ids because it runs in Deno and
 * cannot import `swatches.ts`. If somebody adds a colour to the app and forgets
 * the function, every sheet using it comes back as `custom` and silently
 * matches nothing. This turns that into something a developer can see.
 */
export function isKnownPaletteId(id: string): boolean {
  return id === 'custom' || SWATCHES.some((swatch) => swatch.id === id);
}
