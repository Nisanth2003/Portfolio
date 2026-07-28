#!/usr/bin/env node
/**
 * Build-time data fetch: the public GitHub API -> src/data/github.json
 *
 * Same contract as the sheet fetch: runs before `next build`, never in the browser, and
 * soft-fails to a committed snapshot so a GitHub outage cannot break a deploy.
 *
 * What it does NOT do, and why: the contribution graph — the green squares — is not in
 * the public REST API at all, and the GraphQL endpoint that has it requires a personal
 * token for every request. The public *events* feed is the usual workaround and it is
 * useless here: it holds about 90 days and, for this account, returned seven events across
 * two days on one repository. A heatmap drawn from that reads as "this person does not
 * code", which is the opposite of true.
 *
 * So this uses the repository list, which is complete, needs no token, and is honest:
 * 31 repositories, no forks, pushes spread over twenty distinct months. "Repositories
 * pushed, by month" is a real signal that can be checked against the profile in one click.
 *
 * GITHUB_TOKEN is optional and only raises the rate limit — 60 requests/hour per IP
 * unauthenticated, which is plenty for two calls locally but is shared between all runners
 * on CI. GitHub Actions provides one for free as `secrets.GITHUB_TOKEN`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'github.json');
const FALLBACK_FILE = path.join(ROOT, 'src', 'data', 'github.fallback.json');

/** Months shown in the activity strip. Two years reads as a history without becoming a wall. */
const MONTHS = 24;
/** Repositories listed under "recently pushed". */
const RECENT = 6;

const log = (...a) => console.log('[github]', ...a);
const warn = (...a) => console.warn('[github] WARNING:', ...a);

async function api(pathname) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'nisanth-portfolio-build',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 403 || res.status === 429) {
    throw new Error(
      `rate limited (${res.status}). Unauthenticated GitHub allows 60 requests/hour per IP. ` +
        `Set GITHUB_TOKEN to raise it.`,
    );
  }
  if (res.status === 404) throw new Error(`404 for ${pathname} — is the username right?`);
  if (!res.ok) throw new Error(`GitHub API ${pathname} failed (${res.status}): ${await res.text()}`);

  return res.json();
}

/** `2026-07` for a date string, in UTC so a build machine's timezone cannot shift a month. */
const monthKey = (iso) => iso.slice(0, 7);

/**
 * A contiguous run of months ending at `lastKey`, including the empty ones.
 *
 * Contiguity is the point: plotting only the months that have pushes would draw a dense
 * strip that implies constant activity. The gaps are part of the truth.
 */
function monthSeries(counts, lastKey, length) {
  const [y, m] = lastKey.split('-').map(Number);
  const series = [];
  for (let i = length - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    series.push({ month: key, count: counts[key] ?? 0 });
  }
  return series;
}

async function build(login) {
  const [profile, repos] = await Promise.all([
    api(`/users/${encodeURIComponent(login)}`),
    api(`/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&direction=desc`),
  ]);

  if (!Array.isArray(repos)) throw new Error('the repos endpoint did not return a list');

  // Forks are somebody else's work with your name on the fork button. Counting them as
  // activity would be the kind of padding this whole site is built to avoid.
  const own = repos.filter((r) => !r.fork);

  const monthCounts = {};
  for (const r of own) {
    if (!r.pushed_at) continue;
    const key = monthKey(r.pushed_at);
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }

  const languageCounts = {};
  for (const r of own) {
    if (r.language) languageCounts[r.language] = (languageCounts[r.language] ?? 0) + 1;
  }

  const pushed = own.map((r) => r.pushed_at).filter(Boolean).sort();
  const lastPush = pushed[pushed.length - 1] ?? new Date().toISOString();
  const months = monthSeries(monthCounts, monthKey(lastPush), MONTHS);

  return {
    generatedAt: new Date().toISOString(),
    source: 'github-api',
    login: profile.login,
    name: profile.name ?? profile.login,
    url: profile.html_url,
    publicRepos: profile.public_repos ?? own.length,
    followers: profile.followers ?? 0,
    joined: (profile.created_at ?? '').slice(0, 10),
    lastPush: lastPush.slice(0, 10),
    /**
     * Counted from the series, not from every month on record. The figure sits next to the
     * strip, so it has to describe the strip — `Object.keys(monthCounts)` spans the whole
     * history and would print "20 of 24", which is both wrong and unfalsifiable by looking.
     */
    activeMonths: months.filter((m) => m.count > 0).length,
    months,
    languages: Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count })),
    recent: own.slice(0, RECENT).map((r) => ({
      name: r.name,
      url: r.html_url,
      description: (r.description ?? '').trim(),
      language: r.language ?? '',
      pushedAt: r.pushed_at.slice(0, 10),
      stars: r.stargazers_count ?? 0,
    })),
  };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const saveFallback = process.argv.includes('--save-fallback');

  // Derived from site.ts's github url by default, so there is one place to change the name.
  const login =
    process.env.GITHUB_LOGIN?.trim() ||
    (fs.readFileSync(path.join(ROOT, 'src', 'lib', 'site.ts'), 'utf8').match(
      /github\.com\/([A-Za-z0-9-]+)/,
    )?.[1] ??
      '');

  if (!login) {
    warn('could not work out the GitHub username from src/lib/site.ts — skipping.');
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  let payload = null;
  try {
    log(`source: GitHub API for ${login}${process.env.GITHUB_TOKEN ? ' (authenticated)' : ''}`);
    payload = await build(login);
    log(
      `${payload.publicRepos} public repo(s), ${payload.languages.length} language(s), ` +
        `${payload.activeMonths} active month(s) in the last ${MONTHS}, last push ${payload.lastPush}`,
    );
  } catch (err) {
    if (strict) {
      console.error(`\n[github] FAILED: ${err.message}\n`);
      process.exit(1);
    }
    warn(err.message);

    if (fs.existsSync(FALLBACK_FILE)) {
      payload = { ...JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')), source: 'fallback' };
      log('using the committed snapshot instead.');
    } else {
      // No data and no snapshot is a normal first-run state, not an error: the section
      // simply does not render.
      log('no snapshot to fall back to — the activity section will not render.');
      payload = null;
    }
  }

  if (!payload) {
    fs.writeFileSync(OUT_FILE, `${JSON.stringify({ source: 'none', months: [] }, null, 2)}\n`);
    return;
  }

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  log(`wrote ${path.relative(ROOT, OUT_FILE)} (source: ${payload.source})`);

  if (saveFallback && payload.source !== 'fallback') {
    fs.writeFileSync(FALLBACK_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    log(`refreshed ${path.relative(ROOT, FALLBACK_FILE)}`);
  }
}

main().catch((err) => {
  console.error(`\n[github] FAILED: ${err.stack || err.message}\n`);
  process.exit(1);
});
