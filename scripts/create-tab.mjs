#!/usr/bin/env node
/**
 * One-off: creates an optional tab and fills it from its template CSV.
 *
 * Run: npm run create-tab -- Stack        (or Experience)
 *      npm run create-tab -- Stack --force   overwrite an existing tab
 *
 * This is the ONLY script in the repo that requests a read-write scope, and it is
 * never part of a build. It requires the service account to hold Editor on the
 * spreadsheet — grant that, run this once, then set it back to Viewer. A build
 * credential that can write to your source of truth is a bad thing to leave lying
 * around, which is why this isn't wired into `npm run data`.
 *
 * Safety properties, in order of how much they matter:
 *   - It only ever calls addSheet for a NEW tab and writes inside that tab's range.
 *     There is no code path here that can touch the Projects tab.
 *   - Projects is refused outright, even with --force.
 *   - If the target tab already exists it stops, unless --force, which overwrites
 *     only that tab's cells.
 *   - It reads the header row from the template CSV, so the tab it creates and the
 *     columns the build expects cannot drift apart.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAccessToken, readServiceAccount, SCOPE_READWRITE } from './lib/google-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Only these can be created here. Projects is deliberately absent. */
const CREATABLE = {
  stack: { tab: 'Stack', template: 'stack-template.csv', envPrefix: 'STACK' },
  experience: { tab: 'Experience', template: 'experience-template.csv', envPrefix: 'EXPERIENCE' },
};

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const requested = args.find((a) => !a.startsWith('--'))?.toLowerCase();

const log = (...a) => console.log('[create-tab]', ...a);
const die = (msg) => {
  console.error(`\n[create-tab] FAILED: ${msg}\n`);
  process.exit(1);
};

if (!requested) {
  die(`which tab? Usage:\n  npm run create-tab -- ${Object.values(CREATABLE).map((c) => c.tab).join('\n  npm run create-tab -- ')}`);
}
if (requested === 'projects') {
  die(
    'refusing to create or overwrite the Projects tab — it holds your portfolio and\n' +
      '  this script has no business writing to it. Edit that one by hand.',
  );
}
const target = CREATABLE[requested];
if (!target) {
  die(`unknown tab "${requested}". Known: ${Object.values(CREATABLE).map((c) => c.tab).join(', ')}`);
}

const TEMPLATE = path.join(ROOT, target.template);
const TAB = (process.env[`${target.envPrefix}_RANGE`]?.trim() || `${target.tab}!A1`)
  .split('!')[0]
  .replace(/^'|'$/g, '');

/** Minimal CSV reader — our own template, so quoted fields are the only subtlety. */
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
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
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
      `403 — the service account can read this sheet but not write to it.\n` +
        `  Open the sheet -> Share -> change its role from Viewer to Editor, run this\n` +
        `  again, then set it straight back to Viewer.\n\n${text}`,
    );
  }
  if (!res.ok) die(`Sheets API ${method} ${pathname} failed (${res.status}):\n${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const sheetId =
    process.env[`${target.envPrefix}_SHEET_ID`]?.trim() || process.env.SHEET_ID?.trim();
  const serviceAccount = readServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  if (!sheetId) die('SHEET_ID is not set. Check .env.local.');
  if (!serviceAccount) die('GOOGLE_SERVICE_ACCOUNT_JSON is not set. Check .env.local.');
  if (!fs.existsSync(TEMPLATE)) die(`${path.relative(ROOT, TEMPLATE)} is missing. Run: npm run sheet-template`);

  const rows = parseCsv(fs.readFileSync(TEMPLATE, 'utf8'));
  if (rows.length < 2) die(`${target.template} has no data rows.`);

  log(`authenticating as ${serviceAccount.client_email}`);
  const token = await getAccessToken(serviceAccount, SCOPE_READWRITE);

  const meta = await api(`/${encodeURIComponent(sheetId)}?fields=sheets.properties`, { token });
  const existing = meta.sheets.map((s) => s.properties.title);
  log(`spreadsheet has ${existing.length} tab(s): ${existing.join(', ')}`);

  if (existing.includes(TAB)) {
    if (!FORCE) {
      die(
        `a tab named "${TAB}" already exists — refusing to overwrite it.\n` +
          `  Re-run with --force to replace its contents, or delete the tab first.`,
      );
    }
    log(`--force: overwriting the existing "${TAB}" tab (no other tab is touched)`);
  } else {
    await api(`/${encodeURIComponent(sheetId)}:batchUpdate`, {
      token,
      method: 'POST',
      body: {
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB,
                gridProperties: { rowCount: Math.max(rows.length + 20, 100), columnCount: rows[0].length },
              },
            },
          },
        ],
      },
    });
    log(`created tab "${TAB}"`);
  }

  const range = `${TAB}!A1`;
  await api(
    `/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { token, method: 'PUT', body: { values: rows } },
  );
  log(`wrote ${rows.length} row(s) (1 header + ${rows.length - 1} example) to "${TAB}"`);

  // Freeze the header row — cosmetic, but it makes the tab usable on a phone.
  const created = await api(`/${encodeURIComponent(sheetId)}?fields=sheets.properties`, { token });
  const props = created.sheets.map((s) => s.properties).find((p) => p.title === TAB);
  if (props) {
    await api(`/${encodeURIComponent(sheetId)}:batchUpdate`, {
      token,
      method: 'POST',
      body: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: props.sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });
  }

  console.log(`
Done. Next:
  1. Set the service account back to Viewer in the sheet's Share dialog.
  2. Edit the example rows in the "${TAB}" tab to your real stack.
  3. npm run data     -> downloads the icons and rebuilds the section
`);
}

main().catch((err) => die(err.stack || err.message));
