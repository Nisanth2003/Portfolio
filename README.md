# Portfolio — Medapati Nisanth Reddy

A work-first developer portfolio. The projects come from a **private Google Sheet**,
are validated at build time, and are baked into a static site deployed to GitHub
Pages. No CMS, no database, no runtime API calls.

**Setup instructions: [SETUP.md](./SETUP.md)**

```bash
npm install
npm run dev        # http://localhost:3000 — works with no credentials
```

Needs Node 20.6+ (22 recommended). See [Environment variables](#environment-variables)
for where secrets live and the one gotcha about `.env.local`.

---

## How it fits together

```
Private Google Sheet
        │  service-account JWT, signed with node:crypto (zero deps)
        ▼
scripts/fetch-projects.mjs      build time only, never in the browser
        │  drops unpublished rows, validates slugs and URLs
        ▼
src/data/projects.json          generated, gitignored
        │
        ▼
src/lib/schema.ts (Zod)         coerces strings, fails the build on bad rows
        │
        ▼
Static export → out/ → GitHub Pages
```

Three sources, tried in order, so the site can always build:

1. **Sheets API** with a service account — the sheet stays private.
2. **Published CSV** — simpler, but readable by anyone with the URL.
3. **`src/data/projects.fallback.json`** — committed snapshot. Makes local dev work
   with zero secrets and keeps deploys green if Google is unreachable.

### Why build-time and not client-side

Fetching the sheet from the browser would leak the sheet URL to every visitor, add a
network round-trip to first paint, and shift layout as cards arrived. Fetching at
build time costs nothing at runtime and lets a malformed row fail the build instead
of reaching production.

---

## Design decisions worth knowing

**Cards link to `/work/<slug>`, not straight out to GitHub.** Every project gets a
real, shareable, indexable URL on your own domain. The outbound *Live* and *Code*
links are separate, explicit controls on the card and the detail page — so a click is
never a surprise. Projects with no demo are tagged `Code only`; projects with neither
are tagged `Private`.

**The 3D hero is opt-out and never blocks first paint.** A single WebGL context
renders a custom GLSL liquid-metal backdrop plus metal slabs. It mounts only after
`requestIdleCallback`, and refuses to mount at all on narrow viewports, touch-primary
devices, `prefers-reduced-motion`, fewer than 4 cores, or when WebGL is unavailable.
The render loop stops when the tab is hidden or the hero scrolls out of view. A
visitor can force it on or off; the choice persists.

**The hero scrim is structural, not decoration.** It's biased horizontally — near
opaque behind the headline, clearing to the right where the slabs are — because a
scrim uniform enough to guarantee 4.5:1 text contrast would have hidden the scene.

**The 3D scene never receives pointer events.** Cursor parallax is driven by a window
listener writing to a ref, and slab focus is driven by DOM hover *and* keyboard focus
on the featured rail. There is no raycaster, and the canvas can never swallow a click
meant for a link.

**Filters only appear when they'd be useful.** A chip matching one project is just a
second way to click the same card, so only values shared by 2+ projects become
filters. Early on that means broad categories; the tech chips appear on their own as
the portfolio grows.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Fetch data, then start the dev server (Turbopack) |
| `npm run dev:webpack` | Same, on the webpack dev server — fallback if Turbopack misbehaves |
| `npm run build` | Fetch data, then static-export to `out/` |
| `npm start` | Serve the built `out/` directory locally |
| `npm run data` | Refresh `src/data/projects.json` only |
| `npm run data -- --strict` | Same, but fail instead of falling back (used in CI) |
| `npm run data -- --save-fallback` | Also refresh the committed snapshot |
| `npm run sheet-template` | Emit the three template CSVs |
| `npm run create-tab -- Stack` | One-off: create an optional tab from its template (needs Editor) |
| `npm run typecheck` | `tsc --noEmit` |

`npm start` is a static file server over `out/`, so it only shows what the last
`npm run build` produced — it is not a dev server and will 404 until you've built.

### If a page feels slow, check which mode you're in

`next dev` compiles each route the first time you visit it, and this project's route
graph pulls in three.js, react-three-fiber, drei and postprocessing. Measured on this
machine:

| | first hit to `/work/<slug>/` | second hit |
| --- | --- | --- |
| `next dev` (webpack) | 22.5s | 1.09s |
| `next dev --turbopack` | 18.6s | 0.35s |
| production export | — | static file |

None of that exists in the built site. The detail page ships 41 KB of HTML and about
150 KB of gzipped JS, and its HTML doesn't reference the three.js chunks at all — the
smoke canvas is a dynamic import that only loads after `requestIdleCallback`, so it
never blocks first paint.

To judge real performance, always measure the export, never the dev server:

```bash
npm run build && npm start
```

## Environment variables

Secrets go in **`.env.local` at the repo root**. Start from the template:

```powershell
Copy-Item .env.example .env.local     # PowerShell
```
```bash
cp .env.example .env.local            # Git Bash
```

`.gitignore` already excludes `.env`, `.env.local`, `.env*.local` and
`service-account*.json`. The service-account key file can sit at
`service-account.json` in the repo root, or anywhere outside it — nothing reads it
from a fixed path.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `SHEET_ID` | private sheet | The id from the sheet URL, between `/d/` and `/edit` — not the whole URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | private sheet | The whole JSON key on one line; base64 also accepted |
| `SHEET_RANGE` | optional | Defaults to `Projects!A1:ZZ2000` |
| `STACK_RANGE` | optional | Defaults to `Stack!A1:ZZ500` — the optional second tab |
| `EXPERIENCE_RANGE` | optional | Defaults to `Experience!A1:ZZ500` — the optional third tab |
| `STACK_SHEET_ID` / `EXPERIENCE_SHEET_ID` | optional | Only if that tab lives in a *separate spreadsheet* rather than a second tab |
| `SHEET_CSV_URL` | published-CSV path | Alternative to the two above; the sheet is then public to anyone with the URL |
| `NEXT_PUBLIC_SITE_URL` | absolute URLs | Set by the deploy workflow; only needed locally if you're checking canonical/OG tags |
| `NEXT_PUBLIC_BASE_PATH` | subpath hosting | Set by the deploy workflow (`/3d_portfolio` on Pages) |

None of these are required. With all of them unset, `npm run dev` logs a warning and
serves `src/data/projects.fallback.json`.

### Why the `data` script has `--env-file-if-exists`

Next.js loads `.env.local` on its own, but `scripts/fetch-projects.mjs` runs as a plain
`node` process *before* `next dev` starts and reads `process.env` directly — so without
that flag the sheet variables in `.env.local` would never reach the data fetch, and it
would silently fall back to the snapshot. Hence:

```json
"data": "node --env-file-if-exists=.env.local scripts/fetch-projects.mjs"
```

`-if-exists` so a fresh clone with no `.env.local` still builds. Shell variables win
over the file, so a one-off override still works:

```powershell
# PowerShell
$env:SHEET_ID = "your-sheet-id"
$env:GOOGLE_SERVICE_ACCOUNT_JSON = (Get-Content service-account.json -Raw)
npm run data
```
```bash
# Git Bash
export SHEET_ID="your-sheet-id"
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
npm run data
```

### Getting the key into `.env.local`

A service-account JSON key has embedded newlines that break `.env` parsing, so store it
base64-encoded — `scripts/fetch-projects.mjs:292` accepts either form:

```powershell
$raw = Get-Content service-account.json -Raw
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
Add-Content .env.local "GOOGLE_SERVICE_ACCOUNT_JSON=$b64"
```

A successful fetch logs
`[projects] source: Sheets API (private) as portfolio-reader@…`. Snapshot it once it
works, so the committed fallback doesn't go stale:

```bash
npm run data -- --save-fallback
```

In CI there is no `.env.local` — the workflow injects the same names from GitHub
Actions secrets. See [SETUP.md](./SETUP.md) for creating the service account and
wiring the secrets.

## Working with the sheet

One row per project, 21 columns — **A through U**. `npm run sheet-template` regenerates
`sheet-template.csv` with this exact header row plus two worked examples, and prints
the same reference to the terminal.

### What a slug is

The slug is the project's URL segment: a row with `slug` = `realtime-sub-object-detector`
is served at `/work/realtime-sub-object-detector/`. It's the permanent, shareable
address for that project — the thing you paste into an application or a message.

It must be lowercase letters, numbers and hyphens only. `My App` fails the build;
`my-app` is right. Two rows sharing a slug also fails, and the error names both rows.

Derive it from the title, keep it short, and **treat it as permanent** — see below.

### The columns

| Column | Meaning |
| --- | --- |
| `published` | `TRUE` ships the row. Anything else keeps it a private draft. |
| `order` | Sort position, lower first. Blank sorts last. |
| `slug` | URL segment → `/work/<slug>/`. Lowercase, numbers, hyphens. **Required.** |
| `title` | Project name on the card. **Required.** |
| `tagline` | One line, under ~90 chars. The hook. |
| `description` | Two to four sentences for the detail page. |
| `tech` | Comma separated. Becomes the filter chips. |
| `category` | Broad bucket: Web, Mobile, ML, Infra… |
| `status` | `shipped` \| `wip` \| `archived` |
| `year` | Four digits. |
| `featured` | `TRUE` pins it to the top and into the 3D scene. |
| `liveUrl` | Deployed site. Blank if there's nothing to demo. |
| `repoUrl` | Source. Blank if private. |
| `problem` | What was actually hard. Recruiters read this one. |
| `role` | What you personally did. |
| `impact` | What changed because it exists. Numbers if you have them. |
| `teamSize` | Just the number. |
| `stats` | Stat tiles as `Label:Value` pairs separated by `\|`. |
| `imageUrl` | Overrides the `public/work/<slug>.webp` convention. |
| `videoUrl` | Optional demo clip. |
| `accentColor` | Hex like `#A855F7` to tint this one card. |

Only `slug` and `title` are required. Everything else can be blank, and the UI adapts —
a project with no `liveUrl` is tagged `Code only`, one with neither URL is `Private`,
and a missing image renders a generated plate.

### Safe to change, any time

Editing **values** is the normal case and never breaks anything. Shipped a feature and
want to rewrite `description`, add to `tech`, bump `status` to `shipped`, fill in
`impact` with a real number? Just edit the cell. That's what the sheet is for — the
whole point is that updating the site is editing a spreadsheet, not writing code.

Also safe:

- **Reordering columns** — the build matches by header name, not position.
- **Adding your own columns** — unknown headers are ignored. Keep private notes,
  reminders, a `nextSteps` column, whatever, right alongside the live data.
- **Adding and deleting rows.**
- **Flipping `published`** — `FALSE` pulls a project off the site at the next build
  without losing the write-up.

### The two things that need thought

**Renaming a column header breaks the build.** Headers are the contract. Matching
ignores case, spaces and underscores — `liveUrl`, `Live URL` and `live_url` are the
same column — but `demoUrl` is a different column, and the build fails with
`missing required column`. Add columns freely; never rename one in use.

**Changing a slug silently breaks URLs.** The build won't complain, but
`/work/old-slug/` stops existing. Any link you've already sent — a résumé, an
application, a message — 404s, and search engines drop the indexed page. Nothing warns
you. Pick the slug once and leave it, even if the title later changes; the two don't
have to match.

**Adding a genuinely new field** to the site means two files: add the column to
`KNOWN_COLUMNS` in `scripts/fetch-projects.mjs` and to `src/lib/schema.ts`. Until then
the column just sits in the sheet, ignored.

## The Stack tab (second tab, optional)

`Projects!` covers what you've shipped. The **`Stack`** tab covers what you *know* —
which is a strictly larger set. Without it, the only technologies the site can name are
ones attached to a published project, so SQL, Docker, Linux and Git can never appear
until you build a portfolio piece around them.

It's optional and additive. No `Stack` tab means one informational line during the
fetch and no stack section on the page; nothing about the Projects tab depends on it.

Create it as a second tab named exactly **`Stack`**, then **File → Import →** upload
`stack-template.csv` with **"Replace current sheet"** while that tab is active.

Adding a tab cannot affect the Projects section — the build resolves `Projects!A1:ZZ2000`
by name, so a second tab is invisible to it. Only editing the Projects tab can break it.

<details>
<summary>Creating an optional tab from the command line instead</summary>

`npm run create-tab -- Stack` (or `Experience`) does the same thing over the API. It is
the only script here that requests a **read-write** scope, and it is never part of a
build — the service account must temporarily hold **Editor** on the spreadsheet:

```
Share → change portfolio-reader@… from Viewer to Editor
npm run create-tab -- Stack
Share → set it straight back to Viewer
```

Don't leave Editor granted. A build credential that can write to your source of truth
is a bad thing to have sitting in a GitHub secret. The script refuses to touch a tab
that already exists unless you pass `--force`, refuses `Projects` outright even with
`--force`, and has no code path that can write to any tab other than its target.

</details>

| Column | Meaning |
| --- | --- |
| `published` | `TRUE` ships the row. |
| `order` | Sort position *within its category*. Lower first. |
| `name` | Display name — `TypeScript`, `PostgreSQL`. **Required.** |
| `icon` | A [Simple Icons](https://simpleicons.org) slug, or a full image URL. Blank renders a lettered tile. |
| `category` | Group heading: `Languages`, `Frameworks`, `Cloud`, `Tooling`… |
| `level` | `primary` \| `working` \| `familiar`. Optional. |
| `note` | Short qualifier shown instead of the level — `3 years`, `in production`. |
| `url` | Optional link — docs, or your best project using it. |

Same contract as Projects: matched by header name, unknown columns ignored, drafts
stay in the sheet. Duplicate names are rejected, because two rows reducing to the same
slug would fight over one icon file.

### How icons work

The `icon` cell takes either form:

```
typescript                                   # Simple Icons slug → official brand colour
https://cdn.simpleicons.org/github/ffffff    # same, but you pick the colour
https://cdn.jsdelivr.net/…/react-original.svg  # any image URL, e.g. multi-tone Devicon
```

`npm run data` **downloads each icon into `public/tech/`** and the page serves it from
there. Hotlinking a CDN would make every visitor's browser hit a third party on load —
a privacy leak, an availability dependency, and a contradiction of this project's
no-runtime-third-party-calls property. Downloading costs ~1.5KB once.

`public/tech/` is deliberately **not** gitignored. The icons are tiny SVG text files,
and committing them keeps builds reproducible offline and survives a CDN outage.

Three behaviours worth knowing:

- **Near-black logos are lightened automatically.** Some official brand colours are
  black — Next.js is `#000000`, GitHub is `#181717`. Shipped as-is they'd be invisible
  squares on this background. The build measures each logo's luminance and, below the
  threshold, rewrites the root `fill` to `#E8E8ED` and says so in the log. Only the
  root `<svg fill>` is touched, so multi-colour logos pass through untouched. Override
  by supplying your own colour as a full URL.
- **A failed download never fails the build.** It reuses whatever's already in
  `public/tech/`, and failing that the item renders as a lettered tile.
- **Icons are rendered with `<img src>`, never inlined**, so a hostile SVG behind a
  pasted URL cannot execute script in the page.

Simple Icons are single-colour brand marks — one official colour per logo, not
two-tone. Python comes out flat blue rather than blue-and-yellow. For a genuinely
multi-tone logo, paste a Devicon URL in that row instead.

## The Experience tab (third tab, optional)

Roles, dates, what you did. Same rules as `Stack`: named exactly **`Experience`**,
optional, additive, and absent means the section doesn't render. Import
`experience-template.csv`, or `npm run create-tab -- Experience`.

| Column | Meaning |
| --- | --- |
| `published` | `TRUE` ships the row. |
| `order` | Optional override. Blank = reverse-chronological, which is usually right. |
| `role` | Job title. **Required.** |
| `company` | Employer or client. **Required.** |
| `location` | City, or `Remote`. |
| `type` | `Full-time` \| `Internship` \| `Contract` \| `Freelance` |
| `start` | `Jun 2024`, `2024-06`, `June 2024`, `06/2024` and `2024` all parse. |
| `end` | **Leave blank for your current role** — renders as `Present`. |
| `summary` | One or two sentences on what the job actually was. |
| `highlights` | Bullets separated by `\|`. Lead with the outcome, not the task. |
| `tech` | Comma separated. |
| `url` | Optional link to the company. |

Dates are deliberately loose — you shouldn't have to remember a format to update your
own CV. The fetch script extracts a year and, if it can find one, a month, and sorts on
that. A row with no parseable year sorts last rather than failing, because a blank cell
is a blank cell. An `end` earlier than its `start` *is* rejected, with the row number —
that's a typo, and it would otherwise silently scramble the ordering.

### Getting an edit onto the live site

Sheet edits don't reach the site by themselves — the data is baked in at build time.

- **Locally:** `npm run data` re-fetches, `npm run dev` picks it up.
- **Deployed:** the workflow rebuilds daily at 06:00 UTC, or immediately via
  **Actions → Deploy to GitHub Pages → Run workflow**.

After a meaningful change, refresh the committed snapshot so the fallback doesn't drift:

```bash
npm run data -- --save-fallback
```

A build that fails validation leaves the currently deployed site untouched.

## Stack

Next.js 15 (App Router, `output: 'export'`) · React 19 · TypeScript · Tailwind CSS 3
· shadcn/ui primitives · react-three-fiber + drei · Framer Motion · Zod

## Layout

```
scripts/          build-time data fetch + sheet template generator
src/app/          routes: /, /work/[slug], 404
src/components/
  hero/           R3F scene, GLSL shader, capability gating
  work/           project grid, filters, cards
  site/           nav, footer
  ui/             shadcn primitives
src/lib/          schema (Zod), data access, site config
src/data/         generated projects.json + committed fallback
```

## Before you share the link

- [ ] Swap the work email in `src/lib/site.ts` for a personal one
- [ ] Add `linkedin` in `src/lib/site.ts` if you want it in the footer
- [ ] Add screenshots at `public/work/<slug>.webp` — the generated plates are a
      deliberate fallback, but real screenshots always win
- [ ] Fill in `problem` / `role` / `impact` for each project; those are the columns
      recruiters actually read
- [ ] Deploy at least one project somewhere live, so the grid isn't all `Code only`
