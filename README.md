# FactoryERP Mobile

React Native (Expo) app for **Al-Rehman Embroidery** — a multi-tenant embroidery-factory ERP.
Factory-floor staff use this on phones; there is no web client.

Built so far: the foundation (scaffold, theme, shared components, Supabase schema + RLS, storage),
and every module — **QA Initial Inspection**, **Floor Manager**, **Store Manager**, **Accountant**,
**Company Admin**, the **Super Admin** platform console, and the **Delivery Person** persona that
now owns Order Taking, Procurement, sheet movement, delivery and returns as grants rather than as
separate logins.

## Setup

```bash
npm install
cp .env.example .env      # fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm start
```

`app.config.ts` reads `.env` via `dotenv` and forwards the two values through `expo.extra`, which
`src/data/supabase.ts` reads with `expo-constants`. Nothing is hardcoded, and `.env` is gitignored.
Restart the dev server after editing `.env` — the config is evaluated once at startup.

## Physical iPhone Development

Running on a real iPhone from a Windows PC, with both on the same Wi-Fi.

### What actually connects to what

```text
Windows PC                                   iPhone
  Metro dev server                             Expo Go (the native host app)
  http://<PC-LAN-IP>:8081  ── Wi-Fi ────────►  loads this project's JS bundle
```

Two things are easy to confuse and are not the same:

- **Metro** is an HTTP server that serves the JavaScript bundle. Opening
  `http://<PC-LAN-IP>:8081` in Safari only proves the phone can reach that server. It does not run
  the app, and it is not the goal — it is just a connectivity check.
- **The app** is native code running on the phone. On iOS that native host is **Expo Go**,
  installed from the App Store. It downloads the bundle from Metro and runs it.

`localhost` cannot be used here: from the iPhone, `localhost` is the iPhone.

### Requirements

- Windows PC and iPhone on the **same Wi-Fi network**, with client isolation off (see
  Troubleshooting).
- **Expo Go** installed on the iPhone from the App Store, matching this project's Expo SDK
  (`expo` in `package.json` — SDK 57).
- No Mac, no Xcode and no Apple Developer account for this path. See *When Expo Go is not enough*
  below for when that changes.

### 1. Find the PC's LAN IP

```bash
npm run lan-ip
```

It prints the IPv4 address a phone should use, names the adapter it chose, and lists every other
candidate so a VPN or Hyper-V address is obvious rather than silent. `ipconfig` shows the same data
unfiltered — use the **IPv4 Address** under your *Wireless LAN adapter Wi-Fi*, typically
`192.168.x.x` or `10.x.x.x`.

Nothing writes this address anywhere. It is read live each run, so it stays correct after the router
hands out a different lease.

### 2. Start Metro in LAN mode

```bash
npm run start:lan
```

Expo's dev server already defaults to `--host lan`; this script states it explicitly so a stale
`--localhost` preference cannot quietly bind the server to `127.0.0.1` only. The terminal prints a
QR code and a `exp://<PC-LAN-IP>:8081` URL — confirm that host matches step 1.

### 3. Open it on the iPhone

Scan the QR code with the iPhone **Camera** app and tap the notification, which hands off to Expo
Go. Alternatively, open Expo Go and enter the `exp://<PC-LAN-IP>:8081` URL by hand.

No USB cable is needed at any point on this path — the connection is Wi-Fi only, for both the
initial load and every reload afterwards.

### 4. Develop

Fast Refresh, the dev menu (shake the phone) and console output all work over the same connection.

### When the PC's IP changes

Nothing in the repository has to change — no file contains the address. Restart Metro
(`npm run start:lan`) and re-scan the new QR code. If a local Supabase stack is in use, update
`SUPABASE_URL` in `.env` as well (see below) and restart Metro, since `app.config.ts` is evaluated
once at startup.

### Backend URL on a physical device

The app reads `SUPABASE_URL` from `.env`. Against the **hosted** Supabase project (the default in
`.env.example`) there is nothing to do — that URL is reachable from any network.

Against a **local** stack (`supabase start`), the API is published on `127.0.0.1:54321`, which the
phone cannot reach for the same reason Metro cannot be reached on `localhost`. Point `.env` at the
LAN address instead:

```bash
SUPABASE_URL=http://192.168.x.x:54321
```

`.env` is gitignored, so this stays out of the repository. `supabase/config.toml` keeps its
`127.0.0.1` defaults — those describe the local stack's own bindings and are not app configuration.

### Windows Firewall

The first `npm run start:lan` usually raises a Windows Defender prompt for Node.js. Allowing it on
**Private networks** is enough — but only if Windows has actually categorised your Wi-Fi as private,
which it often has not. Check first:

```powershell
Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
```

If the Wi-Fi row says `Public`, a private-scoped rule will never fire, and inbound connections stay
blocked no matter how many times the prompt is allowed. On a home or office network, set it to
private once (elevated PowerShell):

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

That is also the safer posture generally: `Public` exists to keep a machine invisible on untrusted
networks, so opening a port there is the thing worth avoiding. Leave it `Public` on café and airport
Wi-Fi.

With the profile correct, add the minimal rule if the Node.js prompt was dismissed — one inbound TCP
port, private profile only:

```powershell
New-NetFirewallRule -DisplayName "Expo Metro (dev, LAN only)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -Profile Private
```

Do not disable the firewall. To remove the rule later:

```powershell
Remove-NetFirewallRule -DisplayName "Expo Metro (dev, LAN only)"
```

A local Supabase stack additionally needs port `54321` opened the same way.

This is a local-network development capability only. Nothing here forwards a port, opens the dev
server to the internet, or tunnels through a third party.

### When Expo Go is not enough

Expo Go carries the native modules in the Expo SDK, which is every native dependency this project
currently has (`expo-camera`, `expo-image-picker`, `expo-secure-store`, `expo-font`,
`expo-splash-screen`, `expo-file-system`, `expo-crypto`, plus `react-native-screens` and
`react-native-safe-area-context`). Adding a native module outside that set means Expo Go can no
longer run this app, and a **development build** is required instead.

A development build is a compiled `.ipa` installed on the device. Building one for iOS requires
macOS and Xcode — `npx expo run:ios --device` cannot run on Windows, and no npm script here
pretends otherwise. From a Windows machine the options are EAS Build's hosted macOS builders
(`eas build --profile development --platform ios`, which needs an Apple Developer account and the
device's UDID registered) or a Mac. Once installed, that build connects to Metro over Wi-Fi exactly
as described above, with `npm run start:lan -- --dev-client`.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Expo Go spins, then "Could not connect to development server" | Firewall. Allow Node.js on private networks, or add the port 8081 rule above. |
| Firewall rule exists and it still will not connect | The Wi-Fi profile is `Public`, so a private-scoped rule never applies. Check with `Get-NetConnectionProfile` and set it to `Private`. |
| Safari on the phone cannot open `http://<PC-LAN-IP>:8081` | The phone cannot reach the PC at all — firewall or wrong network. Fix this before looking at anything else. |
| QR shows an unexpected address | A VPN, Hyper-V, WSL or Docker adapter won. Disconnect the VPN, then compare against `npm run lan-ip`. |
| Address is `127.0.0.1` or `localhost` | Metro is bound to loopback. Use `npm run start:lan`, not `npm run start:localhost`. |
| Phone is on guest Wi-Fi or 5 GHz vs 2.4 GHz band | Many routers isolate clients on guest networks and some separate bands. Put both devices on the same primary SSID. |
| App loads, but every screen fails to fetch | `SUPABASE_URL` points at `127.0.0.1`. Use the LAN address, or the hosted project. |
| Address worked yesterday, not today | DHCP handed out a new lease. Re-run `npm run lan-ip`, restart Metro, re-scan. |

## Web deployment (Vercel)

The same codebase exports to a static web build through `react-native-web`. This is an addition, not
a migration: no native configuration changes, and `expo start` / iOS / Android are untouched.

```bash
npm run web        # dev server
npm run build:web  # production export -> dist/
```

`app.config.ts` declares `web.bundler: 'metro'` and `web.output: 'single'`. Single-page is correct
here because there is no Expo Router — react-navigation keeps all routing in memory and never writes
to the URL bar, so `dist/index.html` is the whole site.

### Deploying

`vercel.json` carries the whole configuration:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:web` |
| Output directory | `dist` |
| Framework preset | none — Expo is not a Vercel preset, so autodetection is disabled explicitly |
| Rewrites | every unmatched path → `/index.html` |

Import the repository in the Vercel dashboard, or `npx vercel --prod` from the project root. No
framework needs selecting; `vercel.json` overrides the detected settings.

The rewrite is load-bearing. Static hosting returns 404 for any path that is not a file on disk, so
without it a refresh on anything but `/` gives a blank 404 instead of the app. Vercel checks the
filesystem before applying rewrites, so `/favicon.ico` and `/_expo/static/*` still serve normally.

### Environment variables

`app.config.ts` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` at **build** time and inlines them into
the JS bundle through `expo.extra`. Set both in **Project Settings → Environment Variables** for the
Production and Preview environments, and redeploy after changing either — the values are compiled
in, so a runtime-only secret store would be read too late.

Missing values do not fail the export on their own. `expo export --platform web` exits 0 with both
unset: Metro never executes app code, so the throw in `src/data/supabase.ts` fires in the visitor's
browser instead — a green deployment serving a white screen. `scripts/check-web-env.js` runs ahead of
the export in the Vercel build command to turn that into a red build with a readable message. It is
wired into `vercel.json` only, deliberately: putting it in `app.config.ts` would change `expo start`
and every native command too, and this is a deployment concern.

Two things follow from that, and both are deliberate rather than oversights:

- **The anon key is public in the bundle.** That is what a Supabase anon key is for — it identifies
  the project, it does not authorise anything. Every table is protected by the RLS policies in
  `supabase/migrations/0002_rls.sql` and after, which is the actual control. Do not put the
  `service_role` key anywhere near this build.
- **A public deployment puts the sign-in page on the internet.** RLS still governs what any
  authenticated user can read, but the login endpoint stops being reachable only from staff phones
  on the factory Wi-Fi. If that is not wanted, put the deployment behind Vercel's Deployment
  Protection (Password or Vercel Authentication) before sharing the URL.

### Previewing the production build locally

```bash
npm run build:web
npx serve dist --single
```

`--single` reproduces the Vercel rewrite. Without it, deep paths 404 locally in a way they will not
in production.

### Web feature notes

Photo capture works through the browser's file picker rather than a native camera, and the code
already branches for it — `PhotoTile` and `FactoryFormModal` skip the permission round-trip on web
because awaiting it pushes the `<input type=file>` click outside the tap's user-activation window
and Safari blocks it silently. Session persistence uses `localStorage` on web instead of
`expo-secure-store`, which has no browser equivalent; `src/data/supabase.ts` picks the adapter by
platform.

## Database

Migrations live in `supabase/migrations`, applied in filename order:

| File | Contents |
| --- | --- |
| `0001_init.sql` | Tables, enums, indexes, and the `order_sheets` → `inspection_units` fan-out trigger |
| `0002_rls.sql` | RLS enabled on every table, plus per-role policies |
| `0003_storage.sql` | The three private buckets and their per-factory path policies |
| `0004_order_proof_photo.sql` | Moves the proof photo from `order_sheets` to `orders` |
| `0005_submit_order.sql` | `submit_order` RPC and per-factory order-code generation |
| `0006_inspection_triggers.sql` | Stage advancement and return-alert text, on `inspection_units` |
| `0007_floor_manager.sql` | Job-card/production columns, `floor_status`, `machines`, code generation |
| `0008_store_manager.sql` | Stock, purchase orders, audits, and the `issue_order_materials` RPC |
| `0009_accountant.sql` | Payment ledgers, payroll, loans, expenses, and the three money RPCs |

Against a local stack (needs Docker):

```bash
supabase start
supabase db reset          # migrations + supabase/seed.sql
```

Against a hosted project:

```bash
supabase link --project-ref <ref>
supabase db push
```

### Tenant isolation

Every business table carries `factory_id`, or reaches one through a foreign key. Policies are
anchored to the caller's own `profiles.factory_id` — including for `super_admin`, which has no
cross-factory path by design. `order_sheets` and `inspection_units` have no `factory_id` column of
their own and join through `orders`.

Role capabilities in this pass:

| Role | clients | orders | order_sheets | inspection_units |
| --- | --- | --- | --- | --- |
| `order_taker` | read/write | read/write (+ delete drafts) | read/write | read |
| `qa_person` | read | read | read | read/update |
| every other role | read | read | read | read |

`inspection_units` has **no** insert policy: rows exist only because the `SECURITY DEFINER` fan-out
trigger created them when a sheet was inserted, so the unit count can never drift from the sheet's
`repeats`.

### Verifying RLS

`supabase/seed.sql` sets up one factory — Al-Rehman Embroidery — with one login per role, all on
`password123`:

| Email | Role | Lands on |
| --- | --- | --- |
| `delivery.a@example.com` | `delivery_person` | Staff Dashboard, all five grants |
| `taker.a@example.com` | `order_taker` | Staff Dashboard, `orderTaking` only |
| `qa.a@example.com` | `qa_person` | Inspection queue |
| `floor.a@example.com` | `floor_manager` | Floor Manager dashboard |
| `store.a@example.com` | `store_manager` | Store Manager tabs |
| `accounts.a@example.com` | `accountant` | Ledgers |
| `admin.a@example.com` | `company_admin` | Company Admin dashboard |
| `super.a@example.com` | platform admin | Platform console |
| `worker.a@example.com` | `worker` | Placeholder — workers are payroll, not users |

`delivery.a@` holds all five responsibilities, which is also the only combination that triggers the
separation-of-duties note (the same person requests material and buys it). Clear grants on that
employee in Company Admin to see the empty-dashboard state. `supabase/seed_full.sql` layers a wider
dataset on top — same logins, more orders, movements in every SLA band. The second
tenant the isolation check needs is created inside `rls_smoke.sql` itself and discarded by its
closing `ROLLBACK`, so no second factory or extra logins linger in the database. Run it with:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/rls_smoke.sql
```

The script impersonates each user via `request.jwt.claims` and raises on any cross-factory read,
any cross-factory write, and any role writing outside its own tables.

## Storage

Three private buckets — `client-photos`, `sheet-proof-photos` (design sheets live here too) and
`defect-photos`. Object keys are always `{factory_id}/{file}`; the storage policies read that first
path segment, so the same tenant boundary applies at the storage layer. `src/data/storage.ts`
wraps upload and signed-URL reads.

## Order Taker

A linear ten-screen wizard with a six-dot indicator (New Client shares Pick Client's dot, and the
Sheet Form loop stays on dot 4 for every sheet):

```
Orders list -> Order detail
Pick Client -> (New Client) -> Sheet Count -> Order Photo -> Sheet Form (xN) -> Design Sheet -> Review -> Submitted
   1                1              2              3              4                  5             6
```

### Proof photo is per order, not per sheet

The intake photo covers the whole stack of sheets, so it lives on `orders.proof_photo_url`. There
is no per-sheet proof photo and there should not be one — a colour does not have its own intake
image. Two consequences:

- Order Photo (step 3) is **not** skippable; Design Sheet (step 5) is. Review's "Proof Photo" row is
  therefore always "Added".
- **The Inspection module must read `orders.proof_photo_url`** for its "proof photo from intake"
  reference. Every unit on an order shows the same image. That module is not built yet, so nothing
  is broken today — but do not add a per-sheet photo field to avoid the join.

### Wizard state and submit

`src/features/order-taker/wizardStore.ts` holds the draft. Photos stay as local URIs the whole way
through; they upload in one batch at submit. Uploading on each tap would leave an orphaned storage
file behind every abandoned wizard, and wizards get abandoned often — clients change the count
halfway.

The store resets on exactly three events: the new-order FAB, "Back to My Orders" from Submitted, and
a successful submit. Never on in-wizard back navigation.

Submit uploads the photos, then writes client + order + sheets through the `submit_order` RPC —
one transaction, so a dropped connection mid-write cannot leave half an order behind. The order id
is minted on the device so the proof photo can be filed under `{factory_id}/{orderId}/` before the
row exists. The RPC is SECURITY INVOKER: every write inside it still passes RLS.

Inserting the sheets fires the Prompt 1 fan-out trigger, which generates one `inspection_units` row
per repeat. Resuming a draft replaces its sheets wholesale rather than diffing them, so the units
always match what was actually submitted.

Order codes are `{PREFIX}-{NNNN}`, where the prefix is the first three letters of the factory name
and the counter is per factory: `ALR-0001`, `ALR-0002`. Generation takes a per-factory advisory lock
so two takers submitting at once cannot land on the same code, and a resumed draft keeps whatever
code it was already given.

The orders list is scoped to `created_by` as well as `factory_id` — RLS stops the cross-factory
case, but a taker's queue should show the orders they took, not the whole factory's.

## QA Initial Inspection

A queue feeding a per-unit review loop — not a wizard, so no progress dots anywhere in the module.

```
Inspection queue -> Inspect (one unit) -> Pass ----------> next pending unit, or Complete
                                       -> Defect -> Report Defect -> next pending unit, or Complete
```

### Inspection is per unit, never per sheet

An order of "red x2, royal x1" is **three** decisions, not two. `findFirstPendingUnit(orderId)` in
`src/features/inspection/api.ts` is the single navigation primitive: every decision ends by calling
it, and it is never re-derived inline on a screen — that is how a pass path and a return path end up
disagreeing about the review order.

Units carry a stable overall position across the order (sheets by creation time, then repeat index).
That position is what "Repeat N of {total}" and the `passed_code` (`{orderCode}-R{n}`) are built
from, so it must not shuffle between two loads of the same order.

Advancing between units uses `navigation.replace`, not push — a twelve-repeat order would otherwise
leave twelve screens on the back stack.

### Side effects live in the database

`0006_inspection_triggers.sql` fires on `inspection_units` when a status leaves `pending`:

- **Stage advancement** — when no unit on the order is pending any more, `orders.stage` moves from
  `inspection` to `coding`. This is why the Order Taker's Order Detail timeline updates without that
  module knowing anything about inspection.
- **Alert text** — on a return, `orders.alert_text` is recomputed from the current count of returned
  units. The Order Taker's "Mark Resolved" button clears it, unchanged.

Both are SECURITY DEFINER: a `qa_person` has no update policy on `orders` and should not get one.
The logic sits in the database rather than the client so it stays correct regardless of which client
changed the unit.

**A returned unit counts as "done" for stage advancement** — "no pending units" includes returned
ones, so an order with returns still moves to `coding`. That follows from the spec's wording rather
than an explicit rule, on the reading that the physical return is the order taker's job, handled off
the alert card. Worth confirming against how the floor actually works.

### Proof photo reference

The Inspect screen's "proof photo from intake" reads `orders.proof_photo_url` — one photo covering
the whole order, so **every unit shows the same image**. `order_sheets.proof_photo_url` no longer
exists.

This is a real change to the QA job, not just plumbing: under the original design QA cross-checked
each repeat against a photo of *that colour's* sheet. They now check against one photo of the whole
order, which verifies repeat counts and general sheet condition but not colour-specific detail. If
colour verification matters to the role, raise it with whoever owns the product spec.

## Floor Manager

One dashboard and five sub-workflows, all operating on the shared `orders` / `order_sheets` rows.
The only table this module owns is `machines` — a job card, a materials request and a production run
are facts *about an order*, not entities that could drift away from one.

```
Dashboard -> Home (6 tabs) -> Job Card wizard  -> materials requested
                           -> Inventory        -> machine assigning
                           -> Assign Machines  -> production awaiting
                           -> Production       -> ready
```

### floor_status vs stage

`floor_status` is the granular workflow position; `stage` is the coarse six-label column the Order
Taker's Timeline reads. A trigger derives the second from the first rather than replacing it.

**This mapping is an interpretation, not a stated rule.** Only `queued` (→ `jobcard`) and the two
production statuses (→ `production`) have a coarse equivalent. An order in `materialRequested`,
`readyToCollect` or `machineAssigning` keeps `stage = 'coding'`, so the Order Taker's timeline reads
"QA Coding" right through inventory and machine assignment. If that looks wrong on real data,
mapping those three to `jobcard` is a one-line change in `sync_stage_from_floor_status`.

### Per-sheet stage machine

`src/features/floor-manager/stageMachine.ts` is a pure function of `(stage, stage_index, queue)`.
The queue is the subset of `['clipping', 'piko', 'press']` the order's `stages` flags enable,
evaluated once per **order** — every sheet on an order runs the same finishing stages. Traced for
all three cases:

```
queue=[]                       producing -> readyForFinal -> ready
queue=[clipping]               producing -> readyForStage[0] -> stageFormDone -> readyForFinal -> ready
queue=[clipping,piko,press]    producing -> readyForStage[0] -> ... -> readyForStage[2] -> stageFormDone -> readyForFinal -> ready
```

### Sub-flow drafts

`jobDraft` (`job-card/jobCardStore.ts`), `collectDraft` (local to Collect Detail) and
`stageFormDraft` (local to Stage Form) are separate and independently scoped, so one order's needle
layout or checklist can never appear on the next. The job-card draft is wiped when the flow is
entered from the Job Cards tab and again on exit to Home.

`activeTab` lives in `homeTabStore`, not a route param: every "back to queue" action sets the tab it
belongs to before navigating, so returning from a sub-flow does not reset the queue to "All".

### Open questions — confirm before this is treated as finished

1. **Materials formula** `max(50, round(stitches * total_repeats / 10))` is the mockup's placeholder.
   `total_repeats` is order-wide, as written in the spec, not the repeats of that one colour. Not
   real costing.
2. **Completed Orders / Shifts / Damages** are placeholders by design.
3. **Store Manager does not exist.** `materialRequested -> readyToCollect` has to happen outside this
   app; Requested Detail subscribes to the order row over realtime to notice it.
4. **Handled By** now reads real people — the floor manager is the signed-in user, the inspection
   manager is whoever QA recorded against the order's units. Neither is a real "assigned to" lookup;
   there is no assignment table.
5. **Billing has no UI anywhere.** `orders.billing` is read-only here, and the Invoice card says so
   when it is unset. Where the rate actually gets set is still undecided.
6. **ShareRow** opens the real OS share sheet and only latches once something was actually shared —
   not a toggle. It shares plain text; a rendered job-card PDF would be better and needs a PDF
   pipeline this app does not have.
7. **`threads` is derived, not stored.** QA is supposed to seed `orders.threads` after inspection and
   nothing does yet, so the job card derives it from sheets that have a passed unit — which is also
   the integrity rule `excluded_note` implies, enforced in the application rather than the schema.

## Store Manager

Four tabs over the stock room, plus one cross-module write.

**The Issue tab is the point of the module.** It performs the
`materialRequested -> readyToCollect` transition the Floor Manager module was
built to wait for — Floor Manager's Requested Detail screen already subscribes
to that row over realtime, and needed no changes for this. Collecting the
materials is the floor manager's side and is deliberately not duplicated here.

The transition goes through `issue_order_materials(order_id)` rather than an
`orders` update grant: the store manager may make exactly that one change, on an
order actually waiting for it, and nothing else. Their read of `orders` is
narrowed by a RESTRICTIVE policy to the two statuses their tab is about —
restrictive because `orders_select_same_factory` already grants every role in
the factory a permissive read, and permissive policies OR together.

### Specced from screenshots, so most of it is deliberately unbuilt

This module came from six static list screenshots. Only the four list views are
observed; every detail and creation screen lands on a labelled placeholder
rather than an invented form. Reachable but not built: stock detail, new
purchase order, PO detail, new audit, variance detail.

The one exception is **Issue Detail, which is a proposal, not a spec** — built
by analogy with Floor Manager's Collect Detail because without it the transition
above has no trigger anywhere in the app.

Also unconfirmed, and flagged in code where it matters:

- **Sequin piece count** is always derived from roll count, never typed. The
  conversion factor is unknown, so `piece_count` stays null and the row reads
  "pending conversion table" rather than showing a guessed number.
- **Bobbin rows** have no screenshot; they reuse the thread layout.
- **PO statuses** beyond `awaitingProcurement` / `awaitingConfirmation` are
  inferred, as is treating them as terminal for the tab badge.
- **Low-stock threshold** is assumed per-item. It is computed at query time, not
  stored — thread and tilla measure grams, sequin measures rolls.
- **Tilla shades** live in `src/data/tillaSwatches.ts`, approximated from
  screenshots.

## Accountant

Six tabs — Receivables, Payables, Salary, Loans, Expenses, Stats — plus the
detail and payment screens behind them.

### Read-only is enforced, not just undrawn

Several screens here have no action button because the action belongs to a role
that does not exist yet. That is backed by grants, not by the UI:

- **`orders`** — no update grant for this role at all. Payments go through
  `record_invoice_payment`.
- **`purchase_orders`** — a RESTRICTIVE policy limits this role to
  `status = 'confirmed'`. An unconfirmed PO is unreadable even by id.
- **`invoice_payments` / `po_payments`** — no insert policy: rows arrive only
  from the RPCs, which re-derive the balance and reject an overpayment. Never
  updatable or deletable.
- **`salary_records`** — select only. `paid` moves only through `pay_salary`.
- **`loans` / `loan_history`** — select only, under any circumstance.
  `loan_history` rows are written by `pay_salary` running security-definer.
- **`expenses`** — insert, not update. Approval is the Company Admin's write.

So **Loan Detail and Expense Detail have zero action buttons**, deliberately,
and the database would reject one if it were added.

### One transaction, not two

`pay_salary` marks the salary paid *and* appends the period's loan installment
in a single call. Split into two client writes, a dropped connection between
them overpays the worker and corrupts the loan balance.

### The formulas live in one file

Every money figure comes from `src/lib/ledgerMath.ts`. No screen computes
`netPay` or `remaining` inline. The invoice and bill maths is duplicated in SQL
inside `0009_accountant.sql` on purpose — the server is the boundary, the client
is the display, and the keypad's capping is a convenience on top of it.

**Loans are excluded from every Stats figure.** A disbursement or repayment is
its own ledger, not profit and loss.

### Blockers on real numbers

- **`orders.billing` is still never set by any module.** Every Receivables
  figure depends on it, so totals will read `Rs. 0` until something populates
  it. Not this role's job to fix — but it needs an owner.
- **`monthly_history` has no population mechanism.** The Stats trend chart reads
  it and will be empty; the Current Month card does not, and works.
- **`damage_deduction` / `leave_approved_by`** are display-only. Nothing writes
  them; the flows they imply have not been specced.
- **`po_items.price`** was added here — Prompt 6 gave a PO line a quantity but
  no money, and Payables cannot be computed without it.

## Layout

```
src/
  theme/         colours, typography (IBM Plex Sans / Sans Condensed / Mono), spacing
  components/    shared shells — TopBar, OrderCard, StatusPill, ColorSwatch, PhotoTile,
                 Stepper, NumericKeypadSheet, Timeline, InfoRow, EmptyState
  data/          supabase client, storage helpers, domain types + Zod schemas, SWATCHES palette
  lib/           ledgerMath.ts — every money formula, defined once
  state/         session store (Zustand) + launch-time session restore
  features/      auth/         minimal email/password sign-in
                 staff/        the unified persona: dashboard, grants, sheet movement,
                               delivery, returns
                 order-taker/  the ten-screen wizard, its store and its queries
                 procurement/  PO queue, fulfil, submitted
                 inspection/   the QA queue, per-unit review loop and its session store
                 store-manager/ stock, purchase orders, the issue handoff, audits
                 accountant/   receivables, payables, payroll, loans, expenses, stats
                 floor-manager/ dashboard, six-tab home, job card, inventory, machines, production
                 company-admin/ master data, approvals, reports
                 super-admin/  the cross-tenant platform console
  navigation/    RootNavigator plus the Staff, Inspection, Floor Manager, Store Manager,
                 Accountant, Company Admin and Super Admin stacks. Order Taker and
                 Procurement are nested inside Staff rather than routed to directly.
```

## Routing

`profiles.role` decides which module a signed-in user gets, and it is the only
thing that does — see [RootNavigator.tsx](src/navigation/RootNavigator.tsx).

| Role | Lands on | Owns which part of the order lifecycle |
| --- | --- | --- |
| `staff` / `delivery_person` | Staff Dashboard | Intake, procurement, and everything that physically moves — see below |
| `order_taker` | Staff Dashboard | Intake, up to `stage = 'inspection'` |
| `procurement` | Staff Dashboard | Turning a manual PO with quantities into one with prices and a bill |
| `qa_person` | Inspection queue | `stage = 'inspection'` |
| `floor_manager` | Dashboard | `stage = 'jobcard'` through `'production'` |
| `store_manager` | Stock / PO's / Issue / Audit tabs | Issuing materials: `materialRequested -> readyToCollect` |
| `accountant` | Ledgers, six tabs | Money: invoices once an order is delivered, confirmed bills, payroll |
| `company_admin` | Dashboard | Master data, approvals, reports |
| `super_admin` | Platform console | Above the tenant boundary — gated on `is_platform_admin`, not on this map |
| `worker`, `finishing_partner` | "Role isn't available yet" placeholder | — |

### The unified staff persona

Order Taking and Procurement are **not modules of their own any more**. They are
two of five *grants* on `employees.responsibilities`, and the Staff Dashboard is
the root screen that opens them:

| Grant | Opens | Reuses |
| --- | --- | --- |
| `orderTaking` | Orders List | `features/order-taker` unchanged |
| `sheetMovement` | Move Hub → Drop-off / Pick Up | new |
| `orderDelivery` | Delivery Queue → Deliver → Done | new |
| `orderReturn` | Return Queue → Raise Return | new |
| `procurePo` | Procurement Queue | `features/procurement` unchanged |

One login holds any subset. The dashboard renders one card per grant held and
nothing else — no greyed-out card for a capability an account lacks. Both reused
modules take a `cameFromDashboard` route param that swaps their home header for
a back bar; they are nested navigators inside `StaffStack`, not re-registered
screens.

The legacy `order_taker` and `procurement` roles still sign in and still reach
the same screens: they land on the Dashboard holding the one grant their role
implies (`features/staff/grants.ts`), matching the `role = '…' OR has_grant(…)`
dual-check every policy in `0013_staff_persona.sql` uses. Nothing was removed
from those accounts — the way in moved.

There is no module picker. An employee has their own account and their own
device, so "their own dashboard" is literal, not a disclaimer above a list of
everyone else's modules. A role with no module built sees a placeholder and a
sign-out button — never another role's screens, not even read-only. RLS is the
backstop for that rule, not the mechanism.

Sign-out lives on each module's own home screen (the log-out icon in the home
`TopBar`) and on the placeholder.

## Order lifecycle

Every new screen should say which stage it reads or writes, which roles reach
it, and what must already be true upstream.

Coarse stage (`orders.stage`, drives the shared `Timeline`). Seven values since
`0013_staff_persona.sql`: `coding` ("QA Coding") is gone, and the three floor
phases it used to hide are each named now.
`inspection -> jobcard -> materialCollection -> machineAssignment -> production
-> finishing -> delivery`

Floor Manager sub-status (`orders.floor_status`, alongside `stage`, not a
replacement — see the reconciliation note above):
`queued -> materialRequested -> readyToCollect -> machineAssigning ->
productionAwaiting -> inProduction`

Per-sheet production (`order_sheets.stage`):
`producing -> readyForStage -> stageFormDone -> (loop per finishing stage) ->
readyForFinal -> ready`

`finishing` and `delivery` belong to the staff persona: `sheetMovement` tracks
sheets out to a finishing partner and back, and `orderDelivery` is what sets
`orders.delivered_at` — which is the single event that makes an order payable.
An order can be fully stitched, finished and loaded in the van and still owe
nothing until it is delivered.

### Conventions

- **Screen structure:** `TopBar` (`home` on list roots, `bar` on sub-screens) → scrollable content
  with 16px padding and a 14px gap between blocks → optional sticky 50px bottom bar.
- **Colours and sizes** come from `src/theme` only. No colour literals in components.
- **Interactive tiles and cards** take a shared `variant` prop (`default` / `selected` / `filled` /
  `disabled`) rather than per-screen styling.
- **Fonts** are imported per weight (`@expo-google-fonts/ibm-plex-sans/400Regular`), not from the
  package root — the root pulls all ~40 TTFs into the bundle.
- **Supabase reads** go through the Zod schemas in `src/data/types.ts` so schema drift surfaces at
  the boundary.
