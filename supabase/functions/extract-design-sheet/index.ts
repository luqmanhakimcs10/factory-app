import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
// The beta helper, not the plain one: `fallbacks` exists only on the beta
// message params, so the whole call sits in that namespace and the output
// format has to be the matching beta type.
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.124.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { z } from 'npm:zod@4.5.4';

/**
 * Read a photographed design sheet into structured fields.
 *
 * The Job Card's first step has always promised to "load stitch and colour
 * details" from the photo and never did, so the floor manager retypes a sheet
 * they are already holding. This is that read.
 *
 * **Why a model and not OCR.** The sheets are not one format. A client may bring
 * a Wilcom printout with a proper colour-sequence table, a hand-filled slip, or
 * a photo of the machine's own screen — sometimes all three in a week. A plain
 * OCR engine returns a bag of words with coordinates and leaves the table
 * reconstruction to a parser that has to be rewritten for every new layout, and
 * fails outright on handwriting. Asking a vision model for a fixed schema moves
 * that variability into the prompt.
 *
 * **Why an edge function and not the app.** The API key. A key shipped in a
 * React Native bundle is a public key — the bundle is on the device, and an
 * embroidery factory's phones are not a trusted environment. It never leaves
 * this process.
 *
 * **Whose authority this runs with.** The caller's, never the service role. The
 * Supabase client below is built from the caller's own `Authorization` header,
 * so the image read and the row write both pass through the same RLS the app
 * obeys: a person who could not open this order cannot have it read for them
 * either. That is also why there is no role check in this file — the policies
 * are the check, and a second one here would be a second thing to keep in step.
 */

const MODEL = 'claude-opus-5';

/**
 * The palette the app can actually render, from `src/data/swatches.ts`.
 *
 * The model picks from this list rather than returning a free-text colour name
 * for the app to fuzzy-match afterwards. A sheet says "Peacock 1042" or "گہرا
 * نیلا"; deciding that means the app's `royal` is a judgement about colour, and
 * the model reading the sheet is better placed to make it than a string-distance
 * function is. `custom` is the honest answer when nothing is close, and it is
 * offered so that "nearest of ten" is never forced.
 *
 * Kept in step with SWATCHES by hand — two runtimes, no shared module. The
 * mismatch is caught at the app boundary, which parses this same list.
 */
const PALETTE = [
  'red',
  'royal',
  'green',
  'yellow',
  'black',
  'white',
  'orange',
  'purple',
  'pink',
  'grey',
  'custom',
] as const;

const colorSchema = z.object({
  sequence: z
    .number()
    .int()
    .describe('1-based position in the stitch order, as printed on the sheet.'),
  name: z
    .string()
    .describe("The colour exactly as written on the sheet, in the sheet's own words."),
  palette_match: z
    .enum(PALETTE)
    .describe('Closest colour in the factory palette, or "custom" if none is close.'),
  thread_code: z
    .string()
    .nullable()
    .describe('Thread brand/number if shown, e.g. "Madeira 1147". Null if absent.'),
  stitches: z
    .number()
    .int()
    .nullable()
    .describe('Stitch count for this colour. Null if the sheet does not give one.'),
});

const extractionSchema = z.object({
  design_code: z
    .string()
    .nullable()
    .describe("The client's own design code or number, if the sheet carries one."),
  design_name: z.string().nullable().describe('Design name or title, if named.'),
  total_stitches: z
    .number()
    .int()
    .nullable()
    .describe('Total stitch count as printed. Null if the sheet does not state a total.'),
  width_mm: z
    .number()
    .nullable()
    .describe('Design width in millimetres. Convert from cm or inches if needed.'),
  height_mm: z.number().nullable().describe('Design height in millimetres.'),
  colors: z.array(colorSchema).describe('The colour sequence, in stitch order.'),
  raw_text: z
    .string()
    .describe('Every piece of text visible on the sheet, in reading order.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'high: clean print, every field legible. medium: readable with some inference. low: handwriting, glare or damage left real doubt.',
    ),
  notes: z
    .string()
    .nullable()
    .describe('Anything the floor manager should check by hand. Null if nothing.'),
});

const SYSTEM = `You read embroidery design sheets for a Pakistani embroidery factory and return their contents as structured data.

A sheet is one of three things, and you will not be told which:
- a printout from digitising software (Wilcom, Tajima, Barudan) with a colour-sequence table
- a slip filled in by hand, in English or Urdu, with no fixed layout
- a photograph of an embroidery machine's control screen

Rules:

Transcribe, never invent. If a field is not on the sheet, return null for it. A
null is a correct answer; a plausible guess is not. The floor manager checks
every value against the paper, and a number that looks right is more expensive
to catch than a blank.

Stitch counts are the reason this exists. Read them digit by digit. Thousands
separators vary — "12,480", "12.480" and "12 480" are all twelve thousand four
hundred and eighty. Return a plain integer.

Colour order is stitch order. Number the sequence as the sheet does. If the
sheet gives no explicit order, use top-to-bottom.

Convert dimensions to millimetres. Sheets use mm, cm or inches; say which unit
you found in notes if it was not millimetres.

raw_text is the fallback when the parse is wrong. Include everything legible,
even text you did not use — headers, client names, dates, scribbles in the
margin.

Set confidence honestly. Handwriting, glare on an LCD, a folded or stained sheet
all mean medium or low. Use notes to say exactly which field you are unsure
about, so the floor manager knows where to look rather than re-checking all of
it.`;

interface RequestBody {
  orderId?: string;
  photoPath?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const { orderId, photoPath } = body;
  if (!orderId || !photoPath) {
    return json({ error: 'orderId and photoPath are both required.' }, 400);
  }

  // Checked after the request is validated, not before: these are different
  // faults with different owners. A malformed call is the app's bug and must say
  // so whatever the deploy looks like, while a missing key is the operator's and
  // would otherwise mask every 400 behind it.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Loud, and distinguishable from a model failure: this is the one error a
    // deploy can cause, and it looks like "extraction is broken" from the app.
    return json(
      { error: 'ANTHROPIC_API_KEY is not set on this project. Run: supabase secrets set ANTHROPIC_API_KEY=...' },
      500,
    );
  }

  // The caller's own token, not the service role — see the header comment.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: file, error: downloadError } = await supabase.storage
    .from('job-card-photos')
    .download(photoPath);

  if (downloadError || !file) {
    // Covers both "no such object" and "not yours" — storage does not
    // distinguish them, and neither should the reply.
    return json({ error: 'Could not read that photo.' }, 404);
  }

  const mediaType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const base64 = encodeBase64(await file.arrayBuffer());

  const anthropic = new Anthropic({ apiKey });

  let parsed: z.infer<typeof extractionSchema> | null = null;
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      // A refusal here would surface to the floor manager as a blank sheet with
      // no explanation, so the request carries a fallback rather than failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: 'Read this design sheet. Return every field you can see and null for every field you cannot.',
            },
          ],
        },
      ],
      output_config: { format: betaZodOutputFormat(extractionSchema) },
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'The model declined to read this image.' }, 422);
    }

    parsed = response.parsed_output;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return json({ error: `Could not read the sheet: ${message}` }, 502);
  }

  if (!parsed) {
    return json({ error: 'The sheet was read but did not come back in the expected shape.' }, 502);
  }

  const extraction = {
    ...parsed,
    source_photo_path: photoPath,
    model: MODEL,
    extracted_at: new Date().toISOString(),
  };

  // Persisted so a re-parse never needs the sheet back, and so Review and the
  // Accountant can see what the numbers on the job card were read from. The
  // write is the caller's — if RLS refuses it, the extraction is still returned
  // rather than lost, because the floor manager is standing in front of the
  // sheet right now and a storage failure is not a reason to make them retype it.
  const { error: writeError } = await supabase
    .from('orders')
    .update({ design_sheet_extraction: extraction })
    .eq('id', orderId);

  return json({ extraction, saved: !writeError, saveError: writeError?.message ?? null });
});

/**
 * Chunked so a large photo cannot blow the argument limit.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte image is a stack overflow,
 * not a slow path, and phone cameras produce exactly that size.
 */
function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
