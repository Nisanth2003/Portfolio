# Setup

Two things to wire up once: the private spreadsheet, and GitHub Pages. Budget about
20 minutes. The site already runs without either — it falls back to
`src/data/projects.fallback.json` — so nothing here is blocking.

---

## 0. Run it locally first

```bash
npm install
npm run dev          # http://localhost:3000
```

No credentials needed. You'll see the three projects from the fallback snapshot.

---

## 1. Create the sheet

```bash
npm run sheet-template
```

That writes `sheet-template.csv` (the Projects tab) and `stack-template.csv` (the
optional Stack tab), each with the correct header row and example rows.

1. Go to [sheets.new](https://sheets.new)
2. **File → Import** → upload `sheet-template.csv` → *Replace current sheet*
3. Rename the tab to exactly **`Projects`** (the build looks for `Projects!A1:ZZ2000`)
4. Grab the sheet id from the URL — the long string between `/d/` and `/edit`
5. **Leave the sheet private.** Do not use *File → Share → Publish to web*.

### Optional: the Stack and Experience tabs

Add a tab named exactly **`Stack`** or **`Experience`**, make it the active tab, then
**File → Import** → upload the matching template → *Replace current sheet*. `Stack`
drives the tech grid (logos are downloaded into `public/tech/` at build time);
`Experience` drives the timeline of roles.

Both are entirely optional and entirely additive — with neither tab the fetch logs one
line each and those sections don't render. Nothing about the Projects tab depends on
them, and adding a tab cannot affect it: the build resolves `Projects!A1:ZZ2000` by
name. See the README for column references.

From the command line instead: `npm run create-tab -- Stack`. It needs the service
account temporarily promoted to Editor — set it back to Viewer afterwards.

### The column contract

Read `npm run sheet-template` output for what each column means. The rules that matter
for the long run:

- Columns are matched **by header name**, so reordering them is safe.
- Header matching ignores case, spaces and underscores.
- Unknown columns are ignored — add private notes columns freely.
- Only `slug` and `title` are required. Everything else can be blank.
- `published` must be `TRUE` for a row to reach the site. Drafts stay in the sheet.
- **Only ever add columns. Never rename one that's in use** — that's the one change
  that breaks the build.

---

## 2. Make the sheet readable by the build, without making it public

A URL alone cannot read a private sheet. The only way to keep the sheet genuinely
private is a **service account**: a robot Google identity that you share the sheet
with, and nobody else. The build authenticates as that robot.

### 2a. Create the service account

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a
   project (any name — `portfolio` is fine).
2. Enable the Sheets API:
   **APIs & Services → Library →** search *Google Sheets API* **→ Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   Name it `portfolio-reader`. Skip the optional role and access steps — it needs no
   project permissions at all, only sheet access.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. **This file is a credential. Never commit it.**
5. Copy the `client_email` value from that JSON — it looks like
   `portfolio-reader@your-project.iam.gserviceaccount.com`.

### 2b. Share the sheet with it

In the sheet: **Share** → paste the `client_email` → role **Viewer** → uncheck
*Notify people* → **Share**.

The sheet is now readable by exactly two identities: you, and the build.

### 2c. Test it locally

```bash
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

Expect `[projects] source: Sheets API (private) as portfolio-reader@…`.

Once it works, snapshot it so the fallback isn't stale:

```bash
npm run data -- --save-fallback
```

---

## 3. GitHub

### 3a. Push

```bash
git init
git add .
git commit -m "Portfolio: sheet-driven, static, 3D hero"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already excludes `service-account*.json`, `.env*`, and the generated
`src/data/projects.json`. Check `git status` before your first commit anyway.

> **Repo visibility:** GitHub Pages only serves from a **private** repo on a paid
> plan. A public repo is fine here — your sheet stays private either way, and the
> only thing the repo exposes is the site content you chose to publish. If you want
> the repo private, you'll need GitHub Pro.

### 3b. Add the secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `SHEET_ID` | the long id from the sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the entire contents of the JSON key file |
| `SHEET_RANGE` | *optional* — only if you renamed the tab |

Paste the JSON key whole, including the outer braces. Base64 is also accepted if
your terminal mangles the newlines.

### 3c. Turn on Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Then **Actions → Deploy to GitHub Pages → Run workflow**. The base path and site URL
are derived from the repo name automatically — nothing to configure.

---

## 4. Day-to-day

**Adding a project:** add a row, set `published` to `TRUE`, then either wait for the
06:00 UTC rebuild or hit **Actions → Deploy to GitHub Pages → Run workflow** for an
immediate deploy.

**Adding a screenshot:** drop `public/work/<slug>.webp` in the repo and set the
`imageUrl` column, or leave `imageUrl` blank and the card renders a generated plate.

**Adding a field:** add the column in the sheet, then add it to `KNOWN_COLUMNS` in
`scripts/fetch-projects.mjs` and to `src/lib/schema.ts`. Two files, both obvious.

### When the build fails

The error names the sheet row. Common ones:

| Message | Cause |
| --- | --- |
| `403 … not shared with the service account` | step 2b was skipped |
| `404 … SHEET_ID looks wrong` | you pasted the whole URL instead of just the id |
| `Range "Projects!…" is empty` | the tab isn't named `Projects` |
| `row 7: slug "My App" must be lowercase…` | slugs become URLs — use `my-app` |
| `row 9: slug "x" already used on row 4` | two rows share a slug |
| `no tab named "Projects"` | Sheets reports a missing tab as a 400; rename the tab |
| `CSV URL returned HTML, not CSV` | the sheet isn't published (only for the CSV path) |

Stack-tab problems are always warnings, never build failures — the section just
doesn't render.

A failed build leaves the currently deployed site untouched.

---

## Alternative: published CSV

If the service account is more than you want, publish the sheet to the web as CSV
(**File → Share → Publish to web → Comma-separated values**) and set a `SHEET_CSV_URL`
secret instead. The build supports it and prefers the service account when both exist.

Be clear about the trade: a published sheet is readable by **anyone with the URL**,
and putting that URL in a GitHub secret hides it from your repo but not from the
internet. Every column ships, including ones you meant as private notes.
