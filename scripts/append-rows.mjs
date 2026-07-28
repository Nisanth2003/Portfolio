#!/usr/bin/env node
/**
 * Appends rows from a CSV to a tab in the sheet. Never edits or deletes anything.
 *
 *   npm run append -- Projects projects-new-rows.csv          # dry run, prints the plan
 *   npm run append -- Projects projects-new-rows.csv --apply   # actually writes
 *
 * This is the second script in the repo that asks for a read-write scope, and like
 * create-tab.mjs it is never part of a build — the deploy credential has no business
 * being able to write to your source of truth. Grant the service account Editor, run
 * this, then set it back to Viewer.
 *
 * Safety properties, in the order that matters:
 *
 *   - Append only. The single mutating call is `values:append` with
 *     insertDataOption=INSERT_ROWS, which can only add rows past the last one with data.
 *     There is no PUT, no batchUpdate, no clear and no delete anywhere in this file, so
 *     there is no code path that can overwrite a cell you already typed.
 *   - Idempotent. Existing keys (slug for Projects, the slugified name for Stack) are
 *     read back first and matching CSV rows are skipped, so running it twice does not
 *     duplicate your portfolio.
 *   - Column-order independent. Values are placed by header name into the sheet's own
 *     column order, matched the same way fetch-projects.mjs matches them. Reordering
 *     columns in the sheet cannot silently shift data into the wrong field.
 *   - Fails rather than truncates. A CSV column the sheet does not have is an error, not
 *     a dropped field.
 *   - Dry run by default. Nothing is written without --apply.
 *
 * RAW, not USER_ENTERED: values land exactly as written, so Sheets cannot reinterpret
 * `#A855F7` or turn a year into a date on the way in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAccessToken, readServiceAccount, SCOPE_READWRITE } from './lib/google-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Which column identifies a row, per tab, so re-runs skip what is already there. */
const KEY_COLUMN = { Projects: 'slug', Stack: 'name', Experience: 'role', Contact: 'label' };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const positional = args.filter((a) => !a.startsWith('--'));
const [TAB, CSV_ARG] = positional;

const log = (...a) => console.log('[append]', ...a);
const die = (msg) => {
  console.error(`\n[append] FAILED: ${msg}\n`);
  process.exit(1);
};

const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Identical to the slugify in fetch-projects.mjs, so "Next.js" collides with "nextjs". */
const slugify = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** RFC4180-ish, matching the parser the fetch script uses. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

async function api(pathname, { token, method = 'GET', body } = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();

  if (res.status === 403) {
    die(
      `403 — the service account can read the sheet but not write to it.\n` +
        `  Share -> change its role from Viewer to Editor, run this again, then set it back.\n\n${text}`,
    );
  }
  if (!res.ok) die(`Sheets API ${method} ${pathname} failed (${res.status}):\n${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!TAB || !CSV_ARG) {
    die(
      'usage: npm run append -- <Tab> <file.csv> [--apply]\n' +
        '  e.g. npm run append -- Projects projects-new-rows.csv --apply',
    );
  }
  if (!KEY_COLUMN[TAB]) {
    die(`unknown tab "${TAB}". Known: ${Object.keys(KEY_COLUMN).join(', ')}`);
  }

  const csvPath = path.isAbsolute(CSV_ARG) ? CSV_ARG : path.join(ROOT, CSV_ARG);
  if (!fs.existsSync(csvPath)) die(`no such file: ${path.relative(ROOT, csvPath)}`);

  const sheetId = process.env.SHEET_ID?.trim();
  const serviceAccount = readServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sheetId) die('SHEET_ID is not set. Check .env.local.');
  if (!serviceAccount) die('GOOGLE_SERVICE_ACCOUNT_JSON is not set. Check .env.local.');

  const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (csvRows.length < 2) die(`${path.relative(ROOT, csvPath)} has a header but no data rows.`);
  const csvHeaders = csvRows[0].map(normalizeHeader);
  const csvData = csvRows.slice(1);

  log(`authenticating as ${serviceAccount.client_email}`);
  const token = await getAccessToken(serviceAccount, SCOPE_READWRITE);

  // ---- read the tab as it stands -------------------------------------------------
  const range = `${TAB}!A1:ZZ5000`;
  const current = await api(
    `/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}` +
      `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
    { token },
  );

  const sheetRows = current.values ?? [];
  if (!sheetRows.length) die(`"${TAB}" is empty — it needs its header row before rows can be appended.`);

  const sheetHeaders = sheetRows[0].map(normalizeHeader);
  const columnOf = new Map(sheetHeaders.map((h, i) => [h, i]));
  log(`"${TAB}" has ${sheetRows.length - 1} data row(s) and ${sheetHeaders.length} column(s)`);

  // A CSV field with nowhere to go would be dropped in silence. Say so instead.
  const missing = csvHeaders.filter((h) => h && !columnOf.has(h));
  if (missing.length) {
    die(
      `the "${TAB}" tab has no column(s) for: ${missing.join(', ')}\n` +
        `  Sheet columns: ${sheetHeaders.filter(Boolean).join(', ')}\n` +
        `  Add the column(s) to the sheet, or remove them from the CSV.`,
    );
  }

  /**
   * Every data row must have exactly as many fields as the header.
   *
   * This check exists because its absence cost real damage: a `role` value containing
   * commas was written to the CSV unquoted, so it split into three fields and every column
   * after it shifted left. The rows uploaded cleanly and looked fine — the corruption only
   * surfaced later as "imageurl is not a valid URL: 1", because teamSize had landed in the
   * image column. Silent misalignment is the worst possible failure for a script whose
   * whole job is putting values in the right columns, so it is now fatal and names the row.
   */
  const ragged = csvData
    .map((cells, i) => ({ line: i + 2, got: cells.length }))
    .filter((r) => r.got !== csvHeaders.length);

  if (ragged.length) {
    die(
      `${ragged.length} row(s) in ${path.relative(ROOT, csvPath)} do not have ` +
        `${csvHeaders.length} fields:\n  - ` +
        ragged.map((r) => `line ${r.line}: ${r.got} field(s)`).join('\n  - ') +
        `\n  Almost always an unquoted comma inside a value. Wrap that field in "quotes".`,
    );
  }

  // ---- work out what is genuinely new --------------------------------------------
  const keyHeader = normalizeHeader(KEY_COLUMN[TAB]);
  const keyIndex = columnOf.get(keyHeader);
  if (keyIndex === undefined) die(`"${TAB}" has no "${KEY_COLUMN[TAB]}" column to match rows on.`);
  const csvKeyIndex = csvHeaders.indexOf(keyHeader);
  if (csvKeyIndex === -1) die(`${path.relative(ROOT, csvPath)} has no "${KEY_COLUMN[TAB]}" column.`);

  const existingKeys = new Set(
    sheetRows.slice(1).map((r) => slugify(r[keyIndex])).filter(Boolean),
  );

  const toAppend = [];
  const skipped = [];

  for (const cells of csvData) {
    const key = slugify(cells[csvKeyIndex]);
    if (!key) continue;
    if (existingKeys.has(key)) {
      skipped.push(cells[csvKeyIndex]);
      continue;
    }
    existingKeys.add(key); // guards against a duplicate inside the CSV itself

    // Laid out in the SHEET's column order, not the CSV's.
    const row = new Array(sheetHeaders.length).fill('');
    csvHeaders.forEach((h, i) => {
      if (!h) return;
      row[columnOf.get(h)] = cells[i] ?? '';
    });
    toAppend.push(row);
  }

  if (skipped.length) log(`already present, skipping: ${skipped.join(', ')}`);
  if (!toAppend.length) {
    log('nothing new to append. Done.');
    return;
  }

  log(`${toAppend.length} row(s) to append:`);
  for (const row of toAppend) log(`  + ${row[keyIndex]}`);

  if (!APPLY) {
    console.log(`
Dry run — nothing was written. Re-run with --apply to append these ${toAppend.length} row(s).
`);
    return;
  }

  // ---- the one mutating call ------------------------------------------------------
  const result = await api(
    `/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${TAB}!A1`)}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
    { token, method: 'POST', body: { values: toAppend } },
  );

  log(`appended to ${result.updates?.updatedRange ?? '(range not reported)'}`);
  log(`${result.updates?.updatedRows ?? toAppend.length} row(s) written`);

  console.log(`
Done. Next:
  1. Set the service account back to Viewer in the sheet's Share dialog.
  2. npm run data                     -> pull it back down and validate
  3. npm run data -- --save-fallback  -> refresh the committed snapshot
`);
}

main().catch((err) => die(err.stack || err.message));
