#!/usr/bin/env node
/**
 * Build-time data fetch: private Google Sheet -> src/data/projects.json
 *                                             -> src/data/stack.json
 *
 * Runs before `next build`. Never runs in the browser, so the sheet credentials
 * never reach the client. Three sources, tried in order:
 *
 *   1. Service account (PRIVATE — the sheet is shared with one robot email only).
 *      Needs GOOGLE_SERVICE_ACCOUNT_JSON + SHEET_ID.
 *   2. Published-to-web CSV (obscure, not private — anyone with the URL can read).
 *      Needs SHEET_CSV_URL.
 *   3. src/data/projects.fallback.json — committed snapshot. Keeps `npm run dev`
 *      working with zero secrets and keeps deploys green if Google has a bad day.
 *
 * The JWT is signed with node:crypto, so this adds no dependencies at all.
 *
 * Forward-compatibility contract (this is the part that matters in two years):
 *   - Columns are read BY HEADER NAME, so reordering them in the sheet is safe.
 *   - Header matching ignores case, spaces, and underscores.
 *   - Unknown columns are ignored, so you can add private notes columns freely.
 *   - Missing optional columns are fine. Only `slug` and `title` are required.
 *   - Rows with published != TRUE are dropped here and never reach the build
 *     output, so drafts stay genuinely private.
 *   - Therefore: only ever ADD columns. Never rename one that's already in use.
 *
 * The `Stack` tab is optional and entirely additive: if it doesn't exist, the fetch
 * warns once and the site simply renders no stack section. Nothing about the Projects
 * tab depends on it, which is why it gets its own request rather than a batchGet —
 * a missing tab must not be able to take the projects fetch down with it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAccessToken, readServiceAccount, SCOPE_READONLY } from './lib/google-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'projects.json');
const FALLBACK_FILE = path.join(ROOT, 'src', 'data', 'projects.fallback.json');
const ICON_DIR = path.join(ROOT, 'public', 'tech');
const dataFile = (name) => path.join(ROOT, 'src', 'data', name);

const DEFAULT_RANGE = 'Projects!A1:ZZ2000';
const DEFAULT_STACK_RANGE = 'Stack!A1:ZZ500';
const DEFAULT_EXPERIENCE_RANGE = 'Experience!A1:ZZ500';

/** Canonical column names. Anything not in here is ignored (but never an error). */
const KNOWN_COLUMNS = new Set([
  'published', 'order', 'slug', 'title', 'tagline', 'description',
  'tech', 'category', 'status', 'year', 'featured',
  'liveurl', 'repourl',
  'problem', 'role', 'impact', 'teamsize',
  'stats', 'imageurl', 'videourl', 'accentcolor',
]);

/** Same contract as KNOWN_COLUMNS, for the Stack tab. Only `name` is required. */
const KNOWN_STACK_COLUMNS = new Set([
  'published', 'order', 'name', 'icon', 'category', 'level', 'note', 'url',
]);

/** Experience tab. Only `role` and `company` are required. */
const KNOWN_EXPERIENCE_COLUMNS = new Set([
  'published', 'order', 'role', 'company', 'location', 'type',
  'start', 'end', 'summary', 'highlights', 'tech', 'url',
]);

const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const log = (...a) => console.log('[projects]', ...a);
const warn = (...a) => console.warn('[projects] WARNING:', ...a);

/**
 * Errors carry a code so callers can branch on *what went wrong* rather than on the
 * wording of the message. Matching on text looks fine until a validation message
 * contains the same words — "role is empty" reading as "the tab is empty" turns a
 * real error into a silent skip.
 */
const tagged = (code, message) => Object.assign(new Error(message), { code });

// -------------------------------------------------------------------------- auth

/**
 * One token per process — two tabs must not mean two token exchanges. Always the
 * read-only scope: the build has no business holding a credential that can write.
 */
let tokenPromise = null;
const getAccessTokenOnce = (serviceAccount) => {
  tokenPromise ??= getAccessToken(serviceAccount, SCOPE_READONLY);
  return tokenPromise;
};

async function fetchFromSheetsApi({ sheetId, range, serviceAccount }) {
  const token = await getAccessTokenOnce(serviceAccount);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}` +
    `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();

  if (res.status === 403) {
    throw new Error(
      `Sheets API returned 403. The sheet is not shared with the service account yet.\n` +
        `Share it (Viewer is enough) with: ${serviceAccount.client_email}`,
    );
  }
  if (res.status === 404) {
    throw new Error(
      `Sheets API returned 404. SHEET_ID looks wrong — it's the long id from the sheet URL, ` +
        `between /d/ and /edit. Got: ${sheetId}`,
    );
  }
  // Google reports "this tab does not exist" as a 400 on range parsing, which is
  // deeply unobvious the first time you see it. Say what it actually means.
  if (res.status === 400 && /Unable to parse range/i.test(body)) {
    const tab = range.split('!')[0].replace(/^'|'$/g, '');
    throw tagged(
      'NO_TAB',
      `The spreadsheet has no tab named "${tab}" (Sheets reports a missing tab as a ` +
        `400 range error). Rename the tab to exactly "${tab}", or point the range at the ` +
        `tab you do have. Tab names with spaces must be single-quoted: 'My Tab'!A1:ZZ500`,
    );
  }
  if (!res.ok) throw new Error(`Sheets API failed (${res.status}): ${body}`);

  const { values } = JSON.parse(body);
  if (!values?.length) throw tagged('EMPTY_TAB', `Range "${range}" is empty. Check the tab name.`);
  return values;
}

// ------------------------------------------------------------------- CSV fallback

/** RFC4180-ish parser: handles quoted fields, embedded commas, newlines, "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM if Sheets sent one, and normalise CRLF.
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

async function fetchFromCsv(csvUrl) {
  const res = await fetch(csvUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status}) for ${csvUrl}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      'CSV URL returned HTML, not CSV. The sheet is probably not published to the web, ' +
        'or the URL is the edit link rather than the /pub?output=csv link.',
    );
  }
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Published CSV was empty.');
  return rows;
}

// ----------------------------------------------------------------------- shaping

const isTruthy = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'x' || s === '✓';
};

function rowsToRecords(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  const missingRequired = ['slug', 'title'].filter((h) => !headers.includes(h));
  if (missingRequired.length) {
    throw new Error(
      `Sheet is missing required column(s): ${missingRequired.join(', ')}.\n` +
        `Found headers: ${headers.filter(Boolean).join(', ') || '(none)'}\n` +
        `Run \`npm run sheet-template\` to regenerate a correct header row.`,
    );
  }

  const unknown = headers.filter((h) => h && !KNOWN_COLUMNS.has(h));
  if (unknown.length) log(`ignoring ${unknown.length} unrecognised column(s): ${unknown.join(', ')}`);

  const hasPublishedColumn = headers.includes('published');
  if (!hasPublishedColumn) {
    warn('no `published` column found — every row will be treated as published.');
  }

  const records = [];
  const errors = [];
  const seenSlugs = new Map();
  let draftCount = 0;

  dataRows.forEach((cells, i) => {
    const sheetRow = i + 2; // 1-indexed, plus the header row
    const rec = {};
    headers.forEach((h, ci) => {
      if (!h || !KNOWN_COLUMNS.has(h)) return;
      const raw = cells[ci];
      rec[h] = raw === undefined || raw === null ? '' : String(raw).trim();
    });

    if (hasPublishedColumn && !isTruthy(rec.published)) {
      draftCount++;
      return; // drafts never leave the sheet
    }

    if (!rec.slug) {
      errors.push(`row ${sheetRow}: slug is empty (title: "${rec.title || '?'}")`);
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(rec.slug)) {
      errors.push(
        `row ${sheetRow}: slug "${rec.slug}" must be lowercase letters, numbers and hyphens only ` +
          `(it becomes the URL /work/${rec.slug}/)`,
      );
      return;
    }
    if (seenSlugs.has(rec.slug)) {
      errors.push(`row ${sheetRow}: slug "${rec.slug}" already used on row ${seenSlugs.get(rec.slug)}`);
      return;
    }
    if (!rec.title) {
      errors.push(`row ${sheetRow}: title is empty`);
      return;
    }

    for (const key of ['liveurl', 'repourl', 'imageurl', 'videourl']) {
      const v = rec[key];
      if (!v) continue;
      try {
        const u = new URL(v);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
      } catch {
        errors.push(`row ${sheetRow}: ${key} is not a valid URL: "${v}"`);
      }
    }

    seenSlugs.set(rec.slug, sheetRow);
    records.push({ ...rec, _sheetRow: sheetRow });
  });

  if (errors.length) {
    throw new Error(
      `Sheet has ${errors.length} problem(s) — fix the sheet and rebuild:\n  - ` +
        errors.join('\n  - '),
    );
  }

  log(`${records.length} published project(s)${draftCount ? `, ${draftCount} draft(s) skipped` : ''}`);
  return records;
}

// ------------------------------------------------------------------- stack (tab 2)

const slugify = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const LEVEL_RANK = { primary: 0, working: 1, familiar: 2 };

const levelOrEmpty = (v) => {
  const t = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (t === 'primary' || t === 'daily' || t === 'strong') return 'primary';
  if (t === 'working' || t === 'comfortable') return 'working';
  if (t === 'familiar' || t === 'learning' || t === 'exposure') return 'familiar';
  return '';
};

function stackRowsToRecords(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  if (!headers.includes('name')) {
    throw new Error(
      `Stack tab is missing the required "name" column.\n` +
        `Found headers: ${headers.filter(Boolean).join(', ') || '(none)'}\n` +
        `Run \`npm run sheet-template\` — it writes stack-template.csv too.`,
    );
  }

  const unknown = headers.filter((h) => h && !KNOWN_STACK_COLUMNS.has(h));
  if (unknown.length) log(`stack: ignoring unrecognised column(s): ${unknown.join(', ')}`);

  const hasPublishedColumn = headers.includes('published');
  const records = [];
  const errors = [];
  const seen = new Map();
  let draftCount = 0;

  dataRows.forEach((cells, i) => {
    const sheetRow = i + 2;
    const rec = {};
    headers.forEach((h, ci) => {
      if (!h || !KNOWN_STACK_COLUMNS.has(h)) return;
      const raw = cells[ci];
      rec[h] = raw === undefined || raw === null ? '' : String(raw).trim();
    });

    if (hasPublishedColumn && !isTruthy(rec.published)) {
      draftCount++;
      return;
    }
    if (!rec.name) return; // a blank row is not an error, it's just a blank row

    const slug = slugify(rec.name);
    if (!slug) {
      errors.push(`stack row ${sheetRow}: name "${rec.name}" has no usable characters`);
      return;
    }
    if (seen.has(slug)) {
      errors.push(
        `stack row ${sheetRow}: "${rec.name}" collides with row ${seen.get(slug)} ` +
          `(both reduce to "${slug}")`,
      );
      return;
    }

    if (rec.url) {
      try {
        const u = new URL(rec.url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
      } catch {
        errors.push(`stack row ${sheetRow}: url is not a valid URL: "${rec.url}"`);
      }
    }

    // An icon cell is either a Simple Icons slug or a full image URL. Reject anything
    // that is neither, rather than silently trying to fetch nonsense.
    if (rec.icon && !/^https?:\/\//i.test(rec.icon) && !/^[a-z0-9][a-z0-9.+-]*$/i.test(rec.icon)) {
      errors.push(
        `stack row ${sheetRow}: icon "${rec.icon}" is neither a Simple Icons slug ` +
          `(e.g. "typescript") nor an https URL`,
      );
    }

    seen.set(slug, sheetRow);
    records.push({ ...rec, level: levelOrEmpty(rec.level), _slug: slug, _sheetRow: sheetRow });
  });

  if (errors.length) {
    throw new Error(
      `Stack tab has ${errors.length} problem(s) — fix the sheet and rebuild:\n  - ` +
        errors.join('\n  - '),
    );
  }

  records.sort(
    (a, b) =>
      (Number.parseInt(a.order, 10) || 9999) - (Number.parseInt(b.order, 10) || 9999) ||
      (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) ||
      a.name.localeCompare(b.name),
  );

  log(`stack: ${records.length} item(s)${draftCount ? `, ${draftCount} draft(s) skipped` : ''}`);
  return records;
}

// -------------------------------------------------------------- experience (tab 3)

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Google Sheets silently turns "Jun 2024" into a date, and the API returns dates as
 * serial numbers — so the cell you typed a month into arrives as 45444. Left alone
 * that renders as "45444 — Present" on the live site and sorts as if it had no date
 * at all. Convert it back to something a human typed.
 *
 * The range check is what keeps this safe: serials for any plausible career date sit
 * between 20000 (1954) and 60000 (2064), while a bare year like 2024 is four digits.
 * They cannot be confused, so "2024" stays the year 2024.
 */
const SERIAL_MIN = 20000;
const SERIAL_MAX = 60000;
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);

function normalizePeriodCell(value) {
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return s;

  const n = Number.parseFloat(s);
  if (!(n >= SERIAL_MIN && n <= SERIAL_MAX)) return s;

  const d = new Date(SHEETS_EPOCH_UTC + Math.round(n) * 86400000);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * A sortable number from whatever you typed: "2024-06", "Jun 2024", "June 2024",
 * "06/2024" and "2024" all work. Returns 0 when there's no year at all, which sorts
 * such a row last rather than throwing — a missing date is a blank cell, not an error.
 */
function periodKey(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return 0;

  const year = /(19|20)\d{2}/.exec(s);
  if (!year) return 0;

  const named = MONTHS.findIndex((m) => s.includes(m));
  let month = named >= 0 ? named + 1 : 0;
  if (!month) {
    // Any 1-2 digit number that isn't part of the year: 2024-06, 06/2024.
    const numeric = s.replace(year[0], ' ').match(/\b(0?[1-9]|1[0-2])\b/);
    if (numeric) month = Number.parseInt(numeric[1], 10);
  }
  return Number.parseInt(year[0], 10) * 100 + month;
}

function experienceRowsToRecords(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  const missing = ['role', 'company'].filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `Experience tab is missing required column(s): ${missing.join(', ')}.\n` +
        `Found headers: ${headers.filter(Boolean).join(', ') || '(none)'}\n` +
        `Run \`npm run sheet-template\` — it writes experience-template.csv too.`,
    );
  }

  const unknown = headers.filter((h) => h && !KNOWN_EXPERIENCE_COLUMNS.has(h));
  if (unknown.length) log(`experience: ignoring unrecognised column(s): ${unknown.join(', ')}`);

  const hasPublishedColumn = headers.includes('published');
  const records = [];
  const errors = [];
  let draftCount = 0;

  dataRows.forEach((cells, i) => {
    const sheetRow = i + 2;
    const rec = {};
    headers.forEach((h, ci) => {
      if (!h || !KNOWN_EXPERIENCE_COLUMNS.has(h)) return;
      const raw = cells[ci];
      rec[h] = raw === undefined || raw === null ? '' : String(raw).trim();
    });

    if (hasPublishedColumn && !isTruthy(rec.published)) {
      draftCount++;
      return;
    }
    if (!rec.role && !rec.company) return; // blank row, not an error

    // Before any parsing or display: undo Sheets' date coercion.
    rec.start = normalizePeriodCell(rec.start);
    rec.end = normalizePeriodCell(rec.end);

    if (!rec.role) {
      errors.push(`experience row ${sheetRow}: role is empty (company: "${rec.company}")`);
      return;
    }
    if (!rec.company) {
      errors.push(`experience row ${sheetRow}: company is empty (role: "${rec.role}")`);
      return;
    }
    if (rec.url) {
      try {
        const u = new URL(rec.url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
      } catch {
        errors.push(`experience row ${sheetRow}: url is not a valid URL: "${rec.url}"`);
      }
    }

    const startKey = periodKey(rec.start);
    const endKey = rec.end ? periodKey(rec.end) : Infinity; // blank end = still there

    // A date range that runs backwards is a typo worth catching, not a layout bug to
    // discover later on the live site.
    if (startKey && endKey !== Infinity && endKey && endKey < startKey) {
      errors.push(
        `experience row ${sheetRow}: end "${rec.end}" is before start "${rec.start}"`,
      );
      return;
    }

    records.push({ ...rec, _startKey: startKey, _current: !rec.end, _sheetRow: sheetRow });
  });

  if (errors.length) {
    throw new Error(
      `Experience tab has ${errors.length} problem(s) — fix the sheet and rebuild:\n  - ` +
        errors.join('\n  - '),
    );
  }

  // Reverse chronological, which is what a CV is. `order` overrides it when set, for
  // the case where two roles overlap and you want a particular one read first.
  records.sort(
    (a, b) =>
      (Number.parseInt(a.order, 10) || 9999) - (Number.parseInt(b.order, 10) || 9999) ||
      b._startKey - a._startKey ||
      a.company.localeCompare(b.company),
  );

  log(`experience: ${records.length} role(s)${draftCount ? `, ${draftCount} draft(s) skipped` : ''}`);
  return records;
}

const EXT_BY_TYPE = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Below this against the dark background, a logo is a black square. */
const MIN_LUMINANCE = 0.06;
const RESCUE_COLOR = '#E8E8ED';

/**
 * Some official brand colours are black or near-black — Next.js, GitHub, Express.
 * Shipped as-is they render as invisible tiles on this background, which reads as a
 * broken build rather than a design choice. Only the root <svg fill> is touched, so
 * multi-colour logos (Devicon and friends) are left exactly as they came.
 *
 * Override per row by putting a full URL in the icon cell with your own colour:
 *   https://cdn.simpleicons.org/nextdotjs/ffffff
 */
function rescueDarkSvg(buf) {
  const svg = buf.toString('utf8');
  const match = /^(<svg[^>]*\sfill=")(#[0-9a-f]{3,6})(")/i.exec(svg);
  if (!match || luminance(match[2]) >= MIN_LUMINANCE) return null;

  return {
    from: match[2],
    buf: Buffer.from(
      svg.replace(match[0], `${match[1]}${RESCUE_COLOR}${match[3]}`),
      'utf8',
    ),
  };
}

/**
 * Copies each icon into public/tech/ at build time.
 *
 * Hotlinking a CDN would mean every visitor's browser hits a third party on load —
 * a privacy leak, an availability dependency, and a contradiction of this project's
 * "no runtime third-party calls" property. Downloading here costs ~1.5KB per icon
 * once and leaves the shipped site self-contained.
 *
 * Icons are rendered with <img src>, never inlined, so a hostile SVG from a pasted
 * URL cannot execute script in the page.
 */
async function downloadIcons(records) {
  const withIcons = records.filter((r) => r.icon);
  if (!withIcons.length) return records;

  fs.mkdirSync(ICON_DIR, { recursive: true });
  let fetched = 0;
  let reused = 0;
  const failures = [];
  const rescued = [];

  for (const rec of withIcons) {
    const isUrl = /^https?:\/\//i.test(rec.icon);
    const url = isUrl ? rec.icon : `https://cdn.simpleicons.org/${encodeURIComponent(rec.icon)}`;

    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const ext =
        EXT_BY_TYPE[type] ??
        (isUrl ? path.extname(new URL(url).pathname).toLowerCase().replace('.jpeg', '.jpg') : '');
      if (!Object.values(EXT_BY_TYPE).includes(ext)) {
        throw new Error(`unsupported content-type "${type || 'none'}"`);
      }

      let buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty response');

      if (ext === '.svg') {
        const rescue = rescueDarkSvg(buf);
        if (rescue) {
          buf = rescue.buf;
          rescued.push(`${rec.name} (${rescue.from})`);
        }
      }

      fs.writeFileSync(path.join(ICON_DIR, `${rec._slug}${ext}`), buf);
      rec._iconPath = `/tech/${rec._slug}${ext}`;
      fetched++;
    } catch (err) {
      // A network blip must not fail a build. Reuse whatever is already on disk from
      // a previous run; otherwise this one item renders as a lettered tile.
      const existing = Object.values(EXT_BY_TYPE)
        .map((ext) => `${rec._slug}${ext}`)
        .find((file) => fs.existsSync(path.join(ICON_DIR, file)));

      if (existing) {
        rec._iconPath = `/tech/${existing}`;
        reused++;
      } else {
        rec._iconPath = '';
        failures.push(`${rec.name} (${url}): ${err.message}`);
      }
    }
  }

  log(`stack: ${fetched} icon(s) downloaded${reused ? `, ${reused} reused from disk` : ''}`);
  if (rescued.length) {
    log(
      `stack: lightened ${rescued.length} near-black logo(s) to ${RESCUE_COLOR} so they're ` +
        `visible on the dark background: ${rescued.join(', ')}`,
    );
  }
  if (failures.length) {
    warn(
      `${failures.length} icon(s) could not be fetched — those render as lettered tiles:\n  - ` +
        failures.join('\n  - '),
    );
  }

  const referenced = new Set(records.map((r) => r._iconPath?.replace('/tech/', '')).filter(Boolean));
  const orphans = fs
    .readdirSync(ICON_DIR)
    .filter((f) => Object.values(EXT_BY_TYPE).includes(path.extname(f)) && !referenced.has(f));
  if (orphans.length) {
    log(`stack: ${orphans.length} unreferenced icon(s) in public/tech — safe to delete: ${orphans.join(', ')}`);
  }

  return records;
}

// -------------------------------------------------------------------------- main

/** Which of the three sources is available, resolved once and reused for both tabs. */
function resolveSource() {
  const sheetId = process.env.SHEET_ID?.trim();
  const serviceAccount = readServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const csvUrl = process.env.SHEET_CSV_URL?.trim();

  if (serviceAccount && sheetId) return { kind: 'sheets-api', sheetId, serviceAccount };
  if (csvUrl) return { kind: 'published-csv', csvUrl };
  return { kind: 'fallback' };
}

async function resolveRows() {
  const src = resolveSource();
  const range = process.env.SHEET_RANGE?.trim() || DEFAULT_RANGE;

  if (src.kind === 'sheets-api') {
    log(`source: Sheets API (private) as ${src.serviceAccount.client_email}`);
    return { rows: await fetchFromSheetsApi({ ...src, range }), source: 'sheets-api', src };
  }
  if (src.kind === 'published-csv') {
    log('source: published CSV (readable by anyone with the URL)');
    return { rows: await fetchFromCsv(src.csvUrl), source: 'published-csv', src };
  }
  return { rows: null, source: 'fallback', src };
}

/**
 * Any optional tab beyond Projects, resolved independently and soft-failing by design.
 *
 * Returns null when there is nothing usable, which the caller reads as "render no
 * section". A missing tab is the normal state until you create one, so it's a one-line
 * notice rather than a warning. Each optional tab gets its own request rather than
 * sharing a batchGet: Sheets reports a missing tab as a 400 on the whole request, so a
 * tab you haven't made yet would otherwise take the tabs you have down with it.
 *
 * `{PREFIX}_SHEET_ID` points a tab at a completely separate spreadsheet, for when you
 * want harder isolation than a second tab in the same file.
 */
async function resolveOptionalTab({ label, prefix, defaultRange, toRecords, after }, src, strict) {
  const range = process.env[`${prefix}_RANGE`]?.trim() || defaultRange;
  const csvUrl = process.env[`${prefix}_CSV_URL`]?.trim();
  const sheetId = process.env[`${prefix}_SHEET_ID`]?.trim() || src.sheetId;

  try {
    let rows = null;
    if (src.kind === 'sheets-api') {
      rows = await fetchFromSheetsApi({ ...src, sheetId, range });
    } else if (csvUrl) {
      rows = await fetchFromCsv(csvUrl);
    } else {
      return null;
    }
    const records = toRecords(rows);
    return after ? await after(records) : records;
  } catch (err) {
    // Only a genuinely absent or blank tab is routine. Everything else — a bad row, a
    // renamed column, a 403 — is a warning the user needs to see.
    if (err.code === 'NO_TAB' || err.code === 'EMPTY_TAB') {
      log(`${label}: no "${range.split('!')[0]}" tab yet — skipping that section.`);
      return null;
    }

    // In strict mode (CI) a broken tab has to fail the deploy. Warning and carrying on
    // would publish the site with a whole section silently missing, which looks like a
    // design decision rather than the typo it is. A tab you simply haven't made yet
    // still isn't an error — that's the branch above.
    if (strict) throw new Error(`${label}: ${err.message}`);

    warn(`${label}: ${err.message}`);
    return null;
  }
}

/** The optional tabs, in the order they're fetched. Add a tab by adding an entry. */
const OPTIONAL_TABS = [
  {
    label: 'stack',
    prefix: 'STACK',
    defaultRange: DEFAULT_STACK_RANGE,
    key: 'stack',
    file: 'stack.json',
    fallback: 'stack.fallback.json',
    toRecords: stackRowsToRecords,
    after: downloadIcons,
  },
  {
    label: 'experience',
    prefix: 'EXPERIENCE',
    defaultRange: DEFAULT_EXPERIENCE_RANGE,
    key: 'experience',
    file: 'experience.json',
    fallback: 'experience.fallback.json',
    toRecords: experienceRowsToRecords,
  },
];

async function main() {
  const strict = process.argv.includes('--strict');
  const saveFallback = process.argv.includes('--save-fallback');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  let records = null;
  let source = 'fallback';
  let src = { kind: 'fallback' };

  try {
    const resolved = await resolveRows();
    source = resolved.source;
    src = resolved.src;
    if (resolved.rows) records = rowsToRecords(resolved.rows);
  } catch (err) {
    if (strict) {
      console.error(`\n[projects] FAILED: ${err.message}\n`);
      process.exit(1);
    }
    warn(`${err.message}`);
    warn('falling back to the committed snapshot.');
    records = null;
    source = 'fallback';
  }

  if (!records) {
    if (!fs.existsSync(FALLBACK_FILE)) {
      console.error(
        '\n[projects] FAILED: no sheet configured and no fallback snapshot at\n' +
          `  ${FALLBACK_FILE}\n` +
          'Set SHEET_ID + GOOGLE_SERVICE_ACCOUNT_JSON, or commit a fallback file.\n',
      );
      process.exit(1);
    }
    records = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')).projects ?? [];
    log(`using committed fallback (${records.length} project(s))`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    count: records.length,
    projects: records,
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  log(`wrote ${path.relative(ROOT, OUT_FILE)} (source: ${source})`);

  if (saveFallback && source !== 'fallback') {
    fs.writeFileSync(FALLBACK_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    log(`refreshed ${path.relative(ROOT, FALLBACK_FILE)}`);
  }

  // ---- Optional tabs. Additive: a failure here never fails the projects build. ----

  for (const tab of OPTIONAL_TABS) {
    const outFile = dataFile(tab.file);
    const fallbackFile = dataFile(tab.fallback);

    let records = await resolveOptionalTab(tab, src, strict);
    const tabSource = records ? source : 'fallback';

    if (!records) {
      records = fs.existsSync(fallbackFile)
        ? JSON.parse(fs.readFileSync(fallbackFile, 'utf8'))[tab.key] ?? []
        : [];
      if (records.length) log(`${tab.label}: using committed fallback (${records.length} row(s))`);
    }

    const tabPayload = {
      generatedAt: new Date().toISOString(),
      source: tabSource,
      count: records.length,
      [tab.key]: records,
    };

    fs.writeFileSync(outFile, `${JSON.stringify(tabPayload, null, 2)}\n`);
    log(`wrote ${path.relative(ROOT, outFile)} (source: ${tabSource}, ${records.length} row(s))`);

    if (saveFallback && tabSource !== 'fallback') {
      fs.writeFileSync(fallbackFile, `${JSON.stringify(tabPayload, null, 2)}\n`);
      log(`refreshed ${path.relative(ROOT, fallbackFile)}`);
    }
  }
}

main().catch((err) => {
  console.error(`\n[projects] FAILED: ${err.stack || err.message}\n`);
  process.exit(1);
});
