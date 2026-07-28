#!/usr/bin/env node
/**
 * Changes individual cells in a tab, matched by row key and column name.
 *
 *   npm run edit -- Stack stack-edits.csv           # dry run, prints every change
 *   npm run edit -- Stack stack-edits.csv --apply   # writes
 *
 * The edits file is a CSV with three columns: key,column,value
 *
 *   name,column,value
 *   Android,published,FALSE
 *   AWS,icon,https://…
 *
 * Companion to append-rows.mjs, and the same rules apply: read-write scope, never part of
 * a build, set the service account back to Viewer afterwards.
 *
 * Safety properties:
 *   - Only the named cells are written. The request body is a list of single-cell A1
 *     ranges, so nothing outside them can be touched — there is no whole-row or
 *     whole-range write in this file.
 *   - Rows are found by key, never by position, so inserting or sorting rows in the sheet
 *     between runs cannot make it edit the wrong one.
 *   - An unmatched key or unknown column is an error, not a silent skip.
 *   - Dry run by default, and it prints old -> new for every cell.
 *   - RAW input, so `FALSE` stays the text FALSE and a URL is not turned into a link
 *     formula.
 *
 * Deliberately no delete: to take a row off the site, set `published` to FALSE. The row
 * stays in the sheet with its write-up intact, and flipping it back is one keystroke.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAccessToken, readServiceAccount, SCOPE_READWRITE } from './lib/google-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Which column identifies a row, per tab. Same as append-rows.mjs. */
const KEY_COLUMN = { Projects: 'slug', Stack: 'name', Experience: 'role', Contact: 'label' };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [TAB, CSV_ARG] = args.filter((a) => !a.startsWith('--'));

const log = (...a) => console.log('[edit]', ...a);
const die = (msg) => {
  console.error(`\n[edit] FAILED: ${msg}\n`);
  process.exit(1);
};

const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const slugify = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** 0 -> A, 25 -> Z, 26 -> AA. */
function columnLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

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
        `  Share -> set its role to Editor, run this again, then set it back to Viewer.\n\n${text}`,
    );
  }
  if (!res.ok) die(`Sheets API ${method} ${pathname} failed (${res.status}):\n${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!TAB || !CSV_ARG) die('usage: npm run edit -- <Tab> <edits.csv> [--apply]');
  if (!KEY_COLUMN[TAB]) die(`unknown tab "${TAB}". Known: ${Object.keys(KEY_COLUMN).join(', ')}`);

  const csvPath = path.isAbsolute(CSV_ARG) ? CSV_ARG : path.join(ROOT, CSV_ARG);
  if (!fs.existsSync(csvPath)) die(`no such file: ${path.relative(ROOT, csvPath)}`);

  const sheetId = process.env.SHEET_ID?.trim();
  const serviceAccount = readServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sheetId) die('SHEET_ID is not set. Check .env.local.');
  if (!serviceAccount) die('GOOGLE_SERVICE_ACCOUNT_JSON is not set. Check .env.local.');

  const editRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const [editHeader, ...edits] = editRows;
  if (!edits.length) die('the edits file has no rows.');
  if (editHeader.length < 3) die('the edits file needs three columns: key,column,value');

  log(`authenticating as ${serviceAccount.client_email}`);
  const token = await getAccessToken(serviceAccount, SCOPE_READWRITE);

  const current = await api(
    `/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${TAB}!A1:ZZ5000`)}` +
      `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
    { token },
  );

  const sheetRows = current.values ?? [];
  if (!sheetRows.length) die(`"${TAB}" is empty.`);

  const headers = sheetRows[0].map(normalizeHeader);
  const columnOf = new Map(headers.map((h, i) => [h, i]));
  const keyIndex = columnOf.get(normalizeHeader(KEY_COLUMN[TAB]));
  if (keyIndex === undefined) die(`"${TAB}" has no "${KEY_COLUMN[TAB]}" column.`);

  /** slug -> 1-based sheet row number. */
  const rowOf = new Map();
  sheetRows.slice(1).forEach((r, i) => {
    const key = slugify(r[keyIndex]);
    if (key && !rowOf.has(key)) rowOf.set(key, i + 2);
  });

  const data = [];
  const problems = [];

  for (const [rawKey, rawColumn, rawValue] of edits) {
    const key = slugify(rawKey);
    const column = normalizeHeader(rawColumn);
    const value = rawValue ?? '';

    const rowNumber = rowOf.get(key);
    if (!rowNumber) {
      problems.push(`no row in "${TAB}" with ${KEY_COLUMN[TAB]} = "${rawKey}"`);
      continue;
    }
    const colIndex = columnOf.get(column);
    if (colIndex === undefined) {
      problems.push(`"${TAB}" has no "${rawColumn}" column`);
      continue;
    }

    const before = sheetRows[rowNumber - 1]?.[colIndex] ?? '';
    const range = `${TAB}!${columnLetter(colIndex)}${rowNumber}`;

    if (String(before) === String(value)) {
      log(`unchanged  ${range}  ${rawKey} · ${rawColumn} is already "${value}"`);
      continue;
    }

    log(`change     ${range}  ${rawKey} · ${rawColumn}: "${before}" -> "${value}"`);
    data.push({ range, values: [[value]] });
  }

  if (problems.length) {
    die(`${problems.length} problem(s) — nothing was written:\n  - ${problems.join('\n  - ')}`);
  }
  if (!data.length) {
    log('nothing to change. Done.');
    return;
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --apply for these ${data.length} cell(s).\n`);
    return;
  }

  const result = await api(`/${encodeURIComponent(sheetId)}/values:batchUpdate`, {
    token,
    method: 'POST',
    body: { valueInputOption: 'RAW', data },
  });

  log(`updated ${result.totalUpdatedCells ?? data.length} cell(s)`);
  console.log(`
Done. Next:
  1. Set the service account back to Viewer.
  2. npm run data                     -> pull it back down and validate
  3. npm run data -- --save-fallback  -> refresh the committed snapshot
`);
}

main().catch((err) => die(err.stack || err.message));
