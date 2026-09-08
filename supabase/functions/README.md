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

It exists as a function rather than app code for one reason: the Anthropic API
key. A key in a React Native bundle is a public key.

### Secret

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Without it the function returns a 500 naming this command, rather than failing
as if the model were unavailable — the one deploy mistake that otherwise looks
identical to "extraction is broken".

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

### Cost

One Claude Opus 5 call per read, on one image plus a short prompt — cents at
most, and reading is a separate tap from photographing so a blurry first shot
does not spend one. Model and pricing: `claude-opus-5`, $5/MTok in, $25/MTok out.

### The palette is duplicated

`PALETTE` in `index.ts` repeats the ten ids from `src/data/swatches.ts`. Two
runtimes, no shared module. The model picks from that list directly rather than
returning free text for the app to fuzzy-match, because deciding that a sheet's
"Peacock 1042" is the app's `royal` is a judgement about colour that the model
reading the sheet is better placed to make than a string-distance function.

If you add a swatch, add it here too. `isKnownPaletteId` in
`src/features/floor-manager/designSheet.ts` exists to make the drift visible.
