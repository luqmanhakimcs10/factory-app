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
 * this process. This is also why the key is a Supabase secret rather than a
 * `.env` entry: `app.config.ts` forwards `.env` into `expo.extra`, which is
 * compiled into the shipped JavaScript.
 *
 * **Whose authority this runs with.** The caller's, never the service role. The
 * Supabase client below is built from the caller's own `Authorization` header,
 * so the image read and the row write both pass through the same RLS the app
 * obeys: a person who could not open this order cannot have it read for them
 * either. That is also why there is no role check in this file — the policies
 * are the check, and a second one here would be a second thing to keep in step.
 *
 * **Provider.** Google Gemini, reached over plain REST — there is no Deno-native
 * SDK worth the dependency for one endpoint. Every Gemini-specific detail lives
 * in `readDesignSheet` below; nothing above or below it knows which model read
 * the sheet, so swapping providers again is one function.
 */

/**
 * Flash tier, and overridable without a redeploy.
 *
 * `gemini-3.8-flash` is the most capable Flash model, which is the one that
 * matters here: the hard inputs are handwritten slips and glare on an LCD, and
 * that is exactly where a lighter model gives up. Set `GEMINI_MODEL` to
 * `gemini-3.1-flash-lite` if free-tier quota turns out to bite — it is the
 * higher-throughput option and the swap needs no code change.
 */
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

/**
 * What the model is asked to return.
 *
 * Hand-written rather than generated from the Zod schema below, because Gemini
 * accepts a subset of JSON Schema: optionality is `nullable: true` on a typed
 * field, not a union with null, and `additionalProperties` is not understood.
 * The two are kept in step by `extractionSchema` parsing every response — a
 * drift between them fails here, in this function, rather than as a missing
 * field three screens into the app.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    design_code: {
      type: 'string',
      nullable: true,
      description: "The client's own design code or number, if the sheet carries one.",
    },
    design_name: {
      type: 'string',
      nullable: true,
      description: 'Design name or title, if named.',
    },
    total_stitches: {
      type: 'integer',
      nullable: true,
      description: 'Total stitch count as printed. Null if the sheet states no total.',
    },
    width_mm: {
      type: 'number',
      nullable: true,
      description: 'Design width in millimetres. Convert from cm or inches if needed.',
    },
    height_mm: {
      type: 'number',
      nullable: true,
      description: 'Design height in millimetres.',
    },
    colors: {
      type: 'array',
      description: 'The colour sequence, in stitch order.',
      items: {
        type: 'object',
        properties: {
          sequence: {
            type: 'integer',
            description: '1-based position in the stitch order, as printed on the sheet.',
          },
          name: {
            type: 'string',
            description: "The colour exactly as written on the sheet, in the sheet's own words.",
          },
          palette_match: {
            type: 'string',
            enum: [...PALETTE],
            description: 'Closest colour in the factory palette, or "custom" if none is close.',
          },
          thread_code: {
            type: 'string',
            nullable: true,
            description: 'Thread brand/number if shown, e.g. "Madeira 1147". Null if absent.',
          },
          stitches: {
            type: 'integer',
            nullable: true,
            description: 'Stitch count for this colour. Null if the sheet gives none.',
          },
        },
        required: ['sequence', 'name', 'palette_match', 'thread_code', 'stitches'],
      },
    },
    raw_text: {
      type: 'string',
      description: 'Every piece of text visible on the sheet, in reading order.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description:
        'high: clean print, every field legible. medium: readable with some inference. low: handwriting, glare or damage left real doubt.',
    },
    notes: {
      type: 'string',
      nullable: true,
      description: 'Anything the floor manager should check by hand. Null if nothing.',
    },
  },
  required: [
    'design_code',
    'design_name',
    'total_stitches',
    'width_mm',
    'height_mm',
    'colors',
    'raw_text',
    'confidence',
    'notes',
  ],
};

/**
 * The same shape again, as the thing that actually decides whether a response is
 * usable.
 *
 * A schema sent to a model is a request; this is enforcement. Gemini returning
 * something off-shape has to fail loudly here rather than be written to
 * `orders.design_sheet_extraction` and surface later as a blank needle row.
 */
const extractedColorSchema = z.object({
  sequence: z.number().int(),
  name: z.string(),
  palette_match: z.enum(PALETTE),
  thread_code: z.string().nullable(),
  stitches: z.number().int().nullable(),
});

const extractionSchema = z.object({
  design_code: z.string().nullable(),
  design_name: z.string().nullable(),
  total_stitches: z.number().int().nullable(),
  width_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  colors: z.array(extractedColorSchema),
  raw_text: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string().nullable(),
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

const INSTRUCTION =
  'Read this design sheet. Return every field you can see and null for every field you cannot.';

type Extraction = z.infer<typeof extractionSchema>;

/**
 * The only function that knows which model read the sheet.
 *
 * Everything Gemini-specific is here: the endpoint, the `contents`/`parts`
 * request shape, `generationConfig.responseSchema`, and digging the text back
 * out of `candidates[0].content.parts[]`. Swapping providers means rewriting
 * this function and nothing else.
 */
async function readDesignSheet(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<Extraction> {
  const response = await fetch(ENDPOINT(MODEL), {
    method: 'POST',
    headers: {
      // The key as a header, not `?key=` on the URL. Same authentication, but a
      // query string ends up in proxy and access logs; a header does not.
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            // The system rules ride in the first text part rather than in a
            // `systemInstruction` block. One turn, no cache to preserve, and
            // this shape is the one the REST reference documents — an extraction
            // that fails because of where the rules were placed is a failure
            // with no upside.
            { text: `${SYSTEM}\n\n${INSTRUCTION}` },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Reading a number off a page has one right answer. Sampling variety
        // here would mean the same photo could produce two different stitch
        // counts on two taps of "Read again".
        temperature: 0,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini returned ${response.status}: ${detail.slice(0, 400)}`);
  }

  const payload = await response.json();

  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) throw new Error(`The image was blocked by the model (${blocked}).`);

  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part: { text?: string }) => part.text ?? '').join('')
    : undefined;

  if (!text) {
    const finish = payload?.candidates?.[0]?.finishReason;
    throw new Error(
      finish
        ? `The model returned no text (${finish}).`
        : 'The model returned no text.',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    throw new Error(`The model did not return JSON: ${text.slice(0, 200)}`);
  }

  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`The sheet was read but came back off-shape: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Belt and braces for a fenced response.
 *
 * `responseMimeType: 'application/json'` should make this dead code — but the
 * cost of being wrong is a parse error on a sheet the floor manager is holding,
 * and the cost of the guard is four lines.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
}

interface RequestBody {
  orderId?: string;
  photoPath?: string;
}

/**
 * CORS, because the app also runs in a browser.
 *
 * Expo Go and a native build call this function from a runtime with no origin
 * and no preflight, so it worked from a phone while being unreachable from the
 * Vercel deployment. The browser sends `OPTIONS` first, and a preflight that
 * comes back without these headers is failed by the browser before the real
 * POST is ever attempted — which surfaces through supabase-js as "Failed to
 * send a request to the Edge Function", with no status and nothing in the
 * function logs, because the request genuinely never arrived.
 *
 * `*` rather than the Vercel domain: authorisation here is the bearer token in
 * the `Authorization` header, never a cookie, so there is no ambient authority
 * for a hostile origin to borrow. Pinning the origin would also mean editing
 * this file for every preview deployment, and a stale allowlist fails exactly
 * the same silent way this bug did.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // A day, so the browser stops re-asking before every extraction.
  'Access-Control-Max-Age': '86400',
};

/**
 * Every response leaves through here, which is the point.
 *
 * The headers belong on the error paths as much as the success one. A function
 * that only sets them when things go well still breaks in the browser the
 * moment anything fails — and it fails as an opaque network error rather than
 * as the 400 or 500 the function actually returned, so the real message never
 * reaches the person who could act on it.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // Answered before the method guard below, which would otherwise reject the
  // preflight as "Use POST" — a 405 the browser reads as a failed preflight.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

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
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // Loud, and distinguishable from a model failure: this is the one error a
    // deploy can cause, and it looks like "extraction is broken" from the app.
    return json(
      { error: 'GEMINI_API_KEY is not set on this project. Run: supabase secrets set GEMINI_API_KEY=...' },
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

  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const base64 = encodeBase64(await file.arrayBuffer());

  let parsed: Extraction;
  try {
    parsed = await readDesignSheet(apiKey, base64, mimeType);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return json({ error: `Could not read the sheet: ${message}` }, 502);
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
