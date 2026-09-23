#!/usr/bin/env node
/**
 * Weekly maintenance job: finds GitHub repositories that aren't in the sheet yet,
 * drafts their write-up with Gemini, and appends them as UNPUBLISHED rows.
 *
 *   npm run sync                  # dry run — prints the plan, writes nothing
 *   npm run sync -- --apply       # appends the draft rows (needs Editor)
 *   npm run sync -- --no-ai       # skip Gemini; use repo metadata only
 *   npm run sync -- --topic=x     # topic that always forces a repo in, default `portfolio`
 *   npm run sync -- --topic-only  # old behaviour: ONLY repos tagged with the topic
 *   npm run sync -- --since-days=N  # auto mode window, default 180
 *   npm run sync -- --limit=3     # cap how many repos get drafted in one run
 *   npm run sync -- --repo=a,b    # draft these repos by name, ignoring every gate
 *
 * Three rules this script is built around. Each one is a deliberate limit, not a
 * shortcut, and loosening any of them makes the automation dangerous rather than more
 * useful:
 *
 *   1. DRAFTS ONLY. Every row is written with published=FALSE, and nothing already in
 *      the sheet is ever touched — no edit, no clear, no delete, no reordering. The bot
 *      proposes; you publish. The sheet stays a document you own rather than one you
 *      share with a robot.
 *
 *   2. NEVER IN THE BUILD. This is not part of `npm run data`. A Gemini outage, an
 *      expired key or a rate limit can delay a draft; it must not be able to break a
 *      deploy. The deploy credential also stays read-only — the write path here is a
 *      separate service account, in a separate workflow, with its own secret.
 *
 *   3. NO INVENTED CLAIMS. The model may fill tagline, description, tech and category —
 *      descriptions of what the code is. It is never asked for `impact`, `problem`,
 *      `role`, `teamSize` or `stats`, and those columns aren't even in the CSV it
 *      produces. Those are claims about you, and a fabricated metric on a page a
 *      recruiter reads is the one failure here that actually costs something.
 *
 * Inclusion (changed 2026-09-23). It used to be opt-in by GitHub topic only, and because no
 * repo was ever tagged, every weekly run was a green no-op and new repos never arrived.
 * The default is now AUTO: a public, non-fork repo is drafted when
 *   - it is not in the sheet yet (matched by slug OR by repoUrl, because hand-written
 *     slugs such as `eks-ai-pipeline` for `ai-rep` don't match the repo name), and
 *   - it is not empty (GitHub size > 0), and
 *   - it was pushed within the last SINCE_DAYS days (default 180), and
 *   - its name is not listed in `sync-repos.ignore` at the repo root.
 * A repo tagged with TOPIC is drafted regardless of age. `--topic-only` restores the old
 * gate. This is safe to loosen because rule 1 still holds: a draft is invisible until you
 * flip `published`, so an unwanted draft costs one row you delete or add to the ignore file.
 *
 * The append itself is delegated to append-rows.mjs rather than reimplemented here. That
 * script is already append-only, idempotent by slug, column-order independent and fatal
 * on ragged rows; a second implementation of those properties is a second one to get
 * wrong.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { getAccessToken, readServiceAccount, SCOPE_READONLY } from './lib/google-auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CSV_OUT = path.join(ROOT, 'sync-repos.csv');

const TAB = 'Projects';

/**
 * The only columns this script will ever write. Every column a human should own is
 * absent by construction, so a change to the prompt cannot start filling `impact`.
 */
const COLUMNS = [
  'published', 'slug', 'title', 'tagline', 'description',
  'tech', 'category', 'status', 'year', 'featured', 'liveUrl', 'repoUrl',
];

/** Broad buckets, kept short on purpose — the category becomes a filter chip. */
const CATEGORIES = ['Web', 'Mobile', 'ML', 'Data', 'Infra', 'Tooling', 'Other'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const NO_AI = args.includes('--no-ai');
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const TOPIC = String(opt('topic', process.env.SYNC_TOPIC || 'portfolio')).trim().toLowerCase();
const TOPIC_ONLY = args.includes('--topic-only') || process.env.SYNC_MODE?.trim() === 'topic';
const SINCE_DAYS = Math.max(
  1,
  Number.parseInt(opt('since-days', process.env.SYNC_SINCE_DAYS || '180'), 10) || 180,
);
const IGNORE_FILE = path.join(ROOT, 'sync-repos.ignore');

/** One repo name per line; `#` starts a comment. Missing file = ignore nothing. */
function readIgnoreList() {
  if (!fs.existsSync(IGNORE_FILE)) return new Set();
  return new Set(
    fs
      .readFileSync(IGNORE_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );
}
const LIMIT = Math.max(1, Number.parseInt(opt('limit', '8'), 10) || 8);

/**
 * Named repos, for a one-off draft of something the gates would skip (too old, empty,
 * or ignored). Manual only.
 */
const ONLY = String(opt('repo', ''))
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

const log = (...a) => console.log('[sync]', ...a);
const warn = (...a) => console.warn('[sync] WARNING:', ...a);
const die = (msg) => {
  console.error(`\n[sync] FAILED: ${msg}\n`);
  process.exit(1);
};

/** Collected as markdown and flushed to the CI job summary at the end. */
const summary = [];

const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Identical to the slugify in append-rows.mjs, so the idempotency check agrees with it. */
const slugify = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Cuts at a word boundary so a capped value reads as a sentence, not a truncation. */
function cap(text, max) {
  const t = oneLine(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[,;:.\s]+$/, '')}…`;
}

/** `RealTimeSubObjectDetector` -> `Real Time Sub Object Detector`. You'll edit it anyway. */
const humanTitle = (name) =>
  String(name ?? '')
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const httpUrl = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : '';
  } catch {
    return '';
  }
};

// ------------------------------------------------------------------------- github

async function gh(pathname, { allow404 = false } = {}) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'nisanth-portfolio-sync',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 404 && allow404) return null;
  if (res.status === 403 || res.status === 429) {
    throw new Error(
      `GitHub rate limited (${res.status}). Unauthenticated is 60 requests/hour per IP, ` +
        `shared between every Actions runner. Set GITHUB_TOKEN.`,
    );
  }
  if (!res.ok) throw new Error(`GitHub ${pathname} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Same resolution as fetch-github.mjs: one place in the repo names the account. */
function resolveLogin() {
  const explicit = process.env.GITHUB_LOGIN?.trim();
  if (explicit) return explicit;
  const site = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'site.ts'), 'utf8');
  return site.match(/github\.com\/([A-Za-z0-9-]+)/)?.[1] ?? '';
}

/**
 * READMEs are written for GitHub, not for a model: badge walls, HTML, screenshots and
 * long code blocks are most of the bytes and none of the meaning. Stripping them is
 * partly about cost and mostly about signal — a model handed six badges and a build
 * matrix writes about CI.
 */
const cleanReadme = (md) =>
  String(md ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/^\s*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);

async function readmeFor(login, repo) {
  const payload = await gh(
    `/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo)}/readme`,
    { allow404: true },
  );
  if (!payload?.content) return '';
  const encoding = payload.encoding === 'base64' ? 'base64' : 'utf8';
  return cleanReadme(Buffer.from(payload.content, encoding).toString('utf8'));
}

// ------------------------------------------------------------------------- gemini

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tagline: { type: 'STRING' },
    description: { type: 'STRING' },
    tech: { type: 'ARRAY', items: { type: 'STRING' } },
    category: { type: 'STRING', enum: CATEGORIES },
  },
  required: ['tagline', 'description', 'tech', 'category'],
  propertyOrdering: ['tagline', 'description', 'tech', 'category'],
};

function promptFor(repo, readme) {
  return [
    'You are drafting one row of a software portfolio from a GitHub repository.',
    'Return JSON only, matching the provided schema.',
    '',
    'Rules, in order of importance:',
    '- Use ONLY what the README and metadata below actually state.',
    '- Invent nothing. No metrics, user counts, performance figures, dates, team sizes,',
    '  awards or outcomes. If the README does not say it, it does not go in.',
    '- If the README does not make clear what the project does, return an EMPTY',
    '  description rather than guessing from the repository name.',
    '- Plain, specific prose. No marketing voice, no "cutting-edge", no "leveraging",',
    '  no exclamation marks, no first person.',
    '',
    'Fields:',
    '- tagline: one sentence under 90 characters, describing what it does.',
    '- description: 2-4 sentences for the detail page. What it does, and what was',
    '  technically interesting about building it if the README says so.',
    '- tech: the languages, frameworks and services the README or metadata name. Real',
    '  named technologies only — not "API", "backend" or "machine learning" alone.',
    `- category: exactly one of ${CATEGORIES.join(', ')}.`,
    '',
    `Repository: ${repo.name}`,
    `GitHub description: ${repo.description || '(none)'}`,
    `Primary language: ${repo.language || '(none reported)'}`,
    `Topics: ${(repo.topics ?? []).join(', ') || '(none)'}`,
    `Homepage: ${repo.homepage || '(none)'}`,
    '',
    'README:',
    readme || '(this repository has no README)',
  ].join('\n');
}

async function draftWithGemini(repo, readme) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptFor(repo, readme) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 4096,
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini (${GEMINI_MODEL}) returned ${res.status}: ${body.slice(0, 400)}`);
  }

  const candidate = JSON.parse(body).candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();

  if (!text) {
    // finishReason names the real cause — a safety block and a thinking model that ran
    // out of output budget look identical from an empty string.
    throw new Error(`no text returned (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  }

  const draft = JSON.parse(text);
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('returned JSON that is not an object');
  }
  return draft;
}

/**
 * Guessed from the primary language, and only used when there's no model output.
 * Deliberately coarse: a wrong-but-plausible category is worse than `Other`, which
 * reads as "I didn't know" and gets fixed in one keystroke.
 */
function categoryFor(repo) {
  const lang = (repo.language ?? '').toLowerCase();
  if (['kotlin', 'swift', 'dart', 'objective-c'].includes(lang)) return 'Mobile';
  if (lang === 'jupyter notebook') return 'ML';
  if (['typescript', 'javascript', 'html', 'css', 'scss', 'vue', 'svelte', 'php'].includes(lang)) {
    return 'Web';
  }
  if (['hcl', 'dockerfile', 'shell', 'go', 'rust'].includes(lang)) return 'Infra';
  return 'Other';
}

/**
 * A tech list the sheet can actually parse. fetch-projects splits this cell on commas
 * and semicolons, so an item containing either would silently become two chips.
 */
function techList(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = oneLine(String(item ?? '').replace(/[,;]+/g, ' '));
    if (!value || value.length > 30) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === 8) break;
  }
  return out.join(', ');
}

/** Everything a model returns is treated as a suggestion: capped, re-validated, bounded. */
function rowFor(repo, draft) {
  const topics = (repo.topics ?? []).filter((t) => t.toLowerCase() !== TOPIC);
  const fallbackTech = techList([repo.language, ...topics]);

  return {
    // Never TRUE. The whole design rests on this one cell.
    published: 'FALSE',
    slug: slugify(repo.name),
    title: humanTitle(repo.name),
    tagline: cap(draft?.tagline || repo.description || '', 110),
    description: cap(draft?.description || '', 700),
    tech: draft?.tech?.length ? techList(draft.tech) : fallbackTech,
    category: CATEGORIES.includes(draft?.category) ? draft.category : categoryFor(repo),
    // `archived` is a fact GitHub reports. Anything else is left at `shipped`, which is
    // what the schema already resolves a blank status to — guessing "wip" from a push
    // date would put a label on the card that nothing actually supports.
    status: repo.archived ? 'archived' : 'shipped',
    year: String(repo.created_at ?? '').slice(0, 4),
    featured: 'FALSE',
    liveUrl: httpUrl(repo.homepage),
    repoUrl: repo.html_url ?? '',
  };
}

// -------------------------------------------------------------------------- sheet

async function readProjectsTab({ sheetId, serviceAccount }) {
  const token = await getAccessToken(serviceAccount, SCOPE_READONLY);
  const range = `${TAB}!A1:ZZ5000`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();

  if (res.status === 403) {
    die(
      `Sheets API returned 403 — the sheet is not shared with this service account.\n` +
        `  Share it with: ${serviceAccount.client_email}`,
    );
  }
  if (res.status === 404) die(`Sheets API returned 404 — SHEET_ID looks wrong: ${sheetId}`);
  if (!res.ok) die(`Sheets API returned ${res.status}: ${body.slice(0, 400)}`);

  const rows = JSON.parse(body).values ?? [];
  if (!rows.length) die(`the "${TAB}" tab is empty — it needs its header row.`);

  const headers = rows[0].map(normalizeHeader);
  const columnOf = new Map(headers.map((h, i) => [h, i]));
  const cell = (row, name) => {
    const index = columnOf.get(normalizeHeader(name));
    return index === undefined ? '' : String(row[index] ?? '').trim();
  };

  return {
    headers,
    records: rows.slice(1).map((row, i) => ({
      sheetRow: i + 2,
      slug: cell(row, 'slug'),
      title: cell(row, 'title'),
      status: cell(row, 'status'),
      liveUrl: cell(row, 'liveUrl'),
      repoUrl: cell(row, 'repoUrl'),
    })),
  };
}

// ---------------------------------------------------------------------------- csv

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows) =>
  [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n');

// -------------------------------------------------------------------------- drift

/**
 * Read-only reporting on rows that already exist. This never writes anything, which is
 * why it can afford to be broad: the sheet drifting out of step with GitHub is most of
 * the manual upkeep, and naming the drift is most of the fix.
 */
function driftReport(records, repos, login) {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const notes = [];

  for (const rec of records) {
    if (!rec.slug) continue;
    const match = rec.repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) continue;
    const [, owner, rawName] = match;
    if (owner.toLowerCase() !== login.toLowerCase()) continue;

    const repo = byName.get(rawName.replace(/\.git$/, '').toLowerCase());
    if (!repo) {
      notes.push(
        `row ${rec.sheetRow} (${rec.slug}): repoUrl points at ${owner}/${rawName}, which is not ` +
          `in your public repo list — renamed, deleted, or made private. The link is dead.`,
      );
      continue;
    }
    if (repo.archived && rec.status.toLowerCase() !== 'archived') {
      notes.push(
        `row ${rec.sheetRow} (${rec.slug}): archived on GitHub, sheet says ` +
          `"${rec.status || '(blank, so: shipped)'}".`,
      );
    }
    if (httpUrl(repo.homepage) && !rec.liveUrl) {
      notes.push(
        `row ${rec.sheetRow} (${rec.slug}): GitHub has a homepage (${repo.homepage}), ` +
          `liveUrl is blank.`,
      );
    }
  }

  return notes;
}

// ----------------------------------------------------------------------------- run

function flushSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file || !summary.length) return;
  fs.appendFileSync(file, `## Repo sync\n\n${summary.join('\n')}\n`);
}

async function main() {
  const sheetId = process.env.SHEET_ID?.trim();
  const serviceAccount = readServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sheetId) die('SHEET_ID is not set. Check .env.local.');
  if (!serviceAccount) die('GOOGLE_SERVICE_ACCOUNT_JSON is not set. Check .env.local.');

  const login = resolveLogin();
  if (!login) die('could not work out the GitHub username — set GITHUB_LOGIN.');

  log(
    `account: ${login}   inclusion: ${TOPIC_ONLY ? `topic "${TOPIC}" only` : `auto (${SINCE_DAYS}d) + topic "${TOPIC}"`}` +
      `   mode: ${APPLY ? 'APPLY' : 'dry run'}`,
  );

  const repos = await gh(
    `/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&direction=desc`,
  );
  if (!Array.isArray(repos)) die('the repos endpoint did not return a list');
  log(`${repos.length} public repo(s) on the account`);

  const { headers, records } = await readProjectsTab({ sheetId, serviceAccount });
  log(`"${TAB}" has ${records.length} row(s)`);

  // Checked here rather than discovered by append-rows halfway through, so a dry run
  // surfaces it too.
  const missing = COLUMNS.map(normalizeHeader).filter((h) => !headers.includes(h));
  if (missing.length) {
    die(
      `the "${TAB}" tab has no column(s) for: ${missing.join(', ')}\n` +
        `  Add them to the sheet (see npm run sheet-template) and run this again.`,
    );
  }

  // ---- drift on what already exists ---------------------------------------------
  const drift = driftReport(records, repos, login);
  if (drift.length) {
    console.log('');
    log(`${drift.length} thing(s) drifted out of step with GitHub:`);
    for (const note of drift) log(`  ! ${note}`);
    summary.push('### Drift', ...drift.map((n) => `- ${n}`), '');
  } else {
    log('no drift — every row with a repoUrl matches GitHub.');
  }

  // ---- what is genuinely new -----------------------------------------------------
  // A repo is "already in the sheet" if a row has its slug OR links to it. Slug alone
  // missed rows whose slug was written by hand (`eks-ai-pipeline` for `ai-rep`), and
  // would draft them a second time.
  const existing = new Set(records.map((r) => slugify(r.slug)).filter(Boolean));
  const linked = new Set(
    records
      .map((r) => r.repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i))
      .filter((m) => m && m[1].toLowerCase() === login.toLowerCase())
      .map((m) => m[2].replace(/\.git$/, '').toLowerCase()),
  );
  const inSheet = (r) => existing.has(slugify(r.name)) || linked.has(r.name.toLowerCase());
  const own = repos.filter((r) => !r.fork);
  const hasTopic = (r) => (r.topics ?? []).map((t) => t.toLowerCase()).includes(TOPIC);

  let candidates;
  if (ONLY.length) {
    candidates = own.filter((r) => ONLY.includes(r.name.toLowerCase()));
    const unknown = ONLY.filter((n) => !own.some((r) => r.name.toLowerCase() === n));
    // A typo'd name silently drafting nothing is indistinguishable from "already synced".
    if (unknown.length) die(`no such public non-fork repo: ${unknown.join(', ')}`);
    log(`--repo given: ignoring every gate for ${candidates.map((r) => r.name).join(', ')}`);
  } else if (TOPIC_ONLY) {
    candidates = own.filter(hasTopic);
  } else {
    const ignored = readIgnoreList();
    const cutoff = Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000;
    const skipped = [];
    candidates = own.filter((r) => {
      if (hasTopic(r)) return true;
      if (inSheet(r)) return false;
      const why = ignored.has(r.name.toLowerCase())
        ? 'in sync-repos.ignore'
        : !r.size
          ? 'empty repository'
          : Date.parse(r.pushed_at) < cutoff
            ? `no push in ${SINCE_DAYS} days`
            : '';
      if (why) skipped.push(`${r.name} (${why})`);
      return !why;
    });
    // Name what was left out, so "nothing new" can never again hide a gate problem.
    const recentSkips = skipped.filter((s) => !s.includes('no push in'));
    if (recentSkips.length) log(`skipped: ${recentSkips.join(', ')}`);
  }

  if (!candidates.length) {
    console.log('');
    const why = TOPIC_ONLY
      ? `no repository is tagged "${TOPIC}"`
      : `no repository passed the auto gate (not in the sheet, non-empty, pushed within ${SINCE_DAYS} days, not ignored)`;
    warn(`${why}, so there is nothing to draft.`);
    summary.push(`Nothing to draft: ${why}.`);
    return flushSummary();
  }

  const fresh = candidates.filter((r) => !inSheet(r));
  log(
    `${candidates.length} candidate repo(s), ` +
      `${candidates.length - fresh.length} already in the sheet`,
  );

  if (!fresh.length) {
    log('nothing new to draft. Done.');
    summary.push(`Nothing new — all ${candidates.length} candidate repo(s) are already in the sheet.`);
    return flushSummary();
  }

  const batch = fresh.slice(0, LIMIT);
  if (fresh.length > batch.length) {
    // Never truncate in silence: a capped run that says nothing reads as a complete one.
    warn(
      `${fresh.length} new repo(s) but --limit=${LIMIT}. Deferred to the next run: ` +
        `${fresh.slice(LIMIT).map((r) => r.name).join(', ')}`,
    );
    summary.push(
      `Capped at ${LIMIT} this run. Deferred: ${fresh.slice(LIMIT).map((r) => r.name).join(', ')}`,
      '',
    );
  }

  // ---- draft ---------------------------------------------------------------------
  const rows = [];
  for (const repo of batch) {
    const readme = await readmeFor(login, repo.name);
    if (!readme) warn(`${repo.name}: no README — the description will be left blank for you.`);

    let draft = null;
    if (NO_AI) {
      log(`${repo.name}: --no-ai, using repository metadata only`);
    } else if (readme) {
      try {
        draft = await draftWithGemini(repo, readme);
        log(
          draft
            ? `${repo.name}: drafted by ${GEMINI_MODEL}`
            : `${repo.name}: GEMINI_API_KEY not set, using repository metadata only`,
        );
      } catch (err) {
        // Soft-fail by design. A row with a thin tagline is fine; a run that dies on a
        // quota error and drafts nothing is not.
        warn(`${repo.name}: Gemini failed — ${err.message}`);
        warn(`${repo.name}: falling back to repository metadata.`);
      }
    }

    rows.push(rowFor(repo, draft));
  }

  fs.writeFileSync(CSV_OUT, `${toCsv(rows)}\n`);

  console.log('');
  log(`${rows.length} draft row(s) -> ${path.relative(ROOT, CSV_OUT)}`);
  for (const r of rows) {
    log(`  + ${r.slug}  [${r.category}]  ${r.tagline || '(no tagline)'}`);
    if (!r.description) log('      description blank — nothing in the README to say it honestly');
  }

  summary.push(
    '### New drafts',
    ...rows.map((r) => `- \`${r.slug}\` — ${r.tagline || '(no tagline)'}`),
    '',
    'Written with `published=FALSE`. Review them in the sheet, then set `published` to',
    '`TRUE` and rebuild.',
    '',
  );

  if (!APPLY) {
    console.log(`
Dry run — nothing was written to the sheet.
Re-run with --apply to append these ${rows.length} row(s) as unpublished drafts.
`);
    return flushSummary();
  }

  // ---- hand off to the vetted append path ----------------------------------------
  log('appending via append-rows.mjs');
  const result = spawnSync(
    process.execPath,
    [path.join(HERE, 'append-rows.mjs'), TAB, CSV_OUT, '--apply'],
    { stdio: 'inherit' },
  );
  if (result.error) die(`could not start append-rows.mjs: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);

  flushSummary();
}

main().catch((err) => die(err.stack || err.message));
