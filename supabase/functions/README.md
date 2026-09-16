# Edge functions

Deno, not React Native. These are excluded from the app's `tsconfig.json` —
they import `npm:` specifiers and use the `Deno` global, neither of which
resolves under the Expo types, so `npx tsc` would report errors that are not
errors. Typecheck them with `deno check supabase/functions/**/*.ts` if you have
Deno installed; otherwise the deploy is the check.

## `extract-design-sheet`

Reads a photographed design sheet into structured fields — the colour sequence,
stitch counts, design code, dimensions — so the floor manager confirms numbers
instead of typing them. Called from the Job Card's first step.

It exists as a function rather than app code for one reason: the API key. A key
in a React Native bundle is a public key.

### Secret

```bash
supabase secrets set GEMINI_API_KEY=...
```

Get the key from <https://aistudio.google.com/apikey>. Free tier, no billing
setup, Flash-tier models only.

**Not `.env`.** `app.config.ts` forwards `.env` into `expo.extra`, which is
compiled into the JavaScript that ships to every phone. `SUPABASE_ANON_KEY`
lives there safely because it is public by design and constrained by RLS; a
Gemini key is neither, and would be extractable from any installed build and
billable to you.

Without the secret the function returns a 500 naming this command, rather than
failing as if the model were unavailable — the one deploy mistake that otherwise
looks identical to "extraction is broken".

### Model

`gemini-3.8-flash` by default: the most capable Flash model, which is what
matters when the hard inputs are handwritten slips and glare on an LCD screen.
Override without touching code:

```bash
supabase secrets set GEMINI_MODEL=gemini-3.1-flash-lite
```

`gemini-3.1-flash-lite` is the higher-throughput option if free-tier quota
bites. Free-tier rate limits are no longer published as a static table — check
your own at <https://aistudio.google.com/rate-limit>.

Do not use anything in the 2.0 or 2.5 series: 2.0 is shut down and 2.5 retires
16 October 2026.

### Deploy

```bash
supabase functions deploy extract-design-sheet
```

`verify_jwt` stays at its default of true. The function then builds its Supabase
client from the caller's own `Authorization` header rather than the service
role, so the image read and the `orders` write both pass through the same RLS
the app obeys — it can do exactly what the signed-in floor manager could do, and
nothing more. That is also why there is no role check inside the function: the
policies are the check, and a second copy would be a second thing to keep in
step.

### Swapping providers

Everything provider-specific lives in `readDesignSheet` — the endpoint, the
`contents`/`parts` request shape, `generationConfig.responseSchema`, and pulling
the text back out of `candidates[0].content.parts[]`. Nothing above or below it
knows which model read the sheet. On the app side, `extractDesignSheet` in
`src/features/floor-manager/designSheet.ts` only ever sees this function's own
`{ extraction, saved }` response, so it never needed changing when the provider
did.

Two schemas describe the same shape on purpose. `RESPONSE_SCHEMA` is JSON Schema
sent to Gemini — a request. `extractionSchema` is Zod, and is what decides
whether a response is usable before anything is written to the order. A model
returning something off-shape has to fail in the function, not surface later as
a blank needle row.

### The palette is duplicated

`PALETTE` in `index.ts` repeats the ten ids from `src/data/swatches.ts`. Two
runtimes, no shared module. The model picks from that list directly rather than
returning free text for the app to fuzzy-match, because deciding that a sheet's
"Peacock 1042" is the app's `royal` is a judgement about colour that the model
reading the sheet is better placed to make than a string-distance function.

If you add a swatch, add it here too. `isKnownPaletteId` in
`src/features/floor-manager/designSheet.ts` exists to make the drift visible.
