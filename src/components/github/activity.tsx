import { ArrowUpRight, Github } from 'lucide-react';

import { github, hasGithubActivity } from '@/lib/github';

/**
 * Public GitHub activity, fetched at build time.
 *
 * The green contribution squares everybody wants are not available: they live behind the
 * GraphQL API, which needs a personal token on every request, and the public events feed
 * that people substitute holds ~90 days — for this account, seven events over two days.
 * Drawing a heatmap from that would say "this person does not code", which is false.
 *
 * So this plots what the repository list actually knows: how many repositories were pushed
 * in each of the last 24 months. It is real, it needs no token, and anyone can check it
 * against the profile in one click — which is the only kind of number worth putting on a
 * portfolio. The label says exactly what is being counted, including the gaps.
 */

/** Cell shade by push count. Index 0 is "nothing happened", and it stays visible. */
const SHADES = [
  'bg-foreground/[0.04] ring-1 ring-inset ring-border/30',
  'bg-accent/25',
  'bg-accent/45',
  'bg-accent/70',
  'bg-accent',
];

const shadeFor = (count: number) => SHADES[Math.min(count, SHADES.length - 1)];

const MONTH_LABEL = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function monthName(key: string) {
  const month = Number(key.slice(5, 7));
  return MONTH_LABEL[month - 1] ?? key;
}

/** `2026-07-28` -> `Jul 2026`. Formatted here rather than with toLocaleDateString so the
 *  output cannot vary with the build machine's locale. */
function monthYear(iso: string) {
  if (!iso) return '';
  return `${monthName(iso)} ${iso.slice(0, 4)}`;
}

export function GithubActivity() {
  if (!hasGithubActivity) return null;

  const { months, languages, recent, publicRepos, activeMonths, lastPush, url, login } = github;
  const busiest = Math.max(1, ...months.map((m) => m.count));

  return (
    <section id="activity" aria-labelledby="activity-heading" className="relative border-t border-border/40">
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

      <div className="container max-w-7xl py-24">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">Signal</p>
            <h2
              id="activity-heading"
              className="mt-4 text-balance text-headline font-bold text-monarch"
            >
              Still pushing.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Straight from the GitHub API at build time — no third-party call happens when you
              load this page. Every number below is one click from being checked.
            </p>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-border/60 bg-card/60 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-muted-foreground backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Github aria-hidden="true" className="size-4" />
            @{login}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </div>

        {/* ---- the numbers ---- */}
        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/50 bg-border/40 sm:grid-cols-4">
          {[
            { label: 'Public repos', value: String(publicRepos) },
            { label: 'Languages', value: String(languages.length) },
            { label: 'Active months', value: `${activeMonths}/${months.length}` },
            { label: 'Last push', value: monthYear(lastPush) },
          ].map((stat) => (
            <div key={stat.label} className="bg-card/80 px-5 py-5">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="tabular mt-2 text-lg font-bold text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {/* ---- the strip ---- */}
        <figure className="mt-10">
          <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
              Repositories pushed, by month · last {months.length} months
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
              none
              {SHADES.map((shade, i) => (
                <span key={i} className={`size-2.5 rounded-[2px] ${shade}`} />
              ))}
              {busiest}+
            </span>
          </figcaption>

          <ol className="flex items-end gap-[3px]">
            {months.map((m) => (
              <li
                key={m.month}
                className="group/cell relative flex-1"
                // The title is the accessible name too: a screen reader gets
                // "March 2026, 4 repositories" rather than an unlabelled box.
                title={`${monthName(m.month)} ${m.month.slice(0, 4)} — ${m.count} ${
                  m.count === 1 ? 'repository' : 'repositories'
                }`}
              >
                <span className="sr-only">
                  {monthName(m.month)} {m.month.slice(0, 4)}: {m.count}
                </span>
                <span
                  aria-hidden="true"
                  className={`block h-10 rounded-[3px] transition-transform duration-200 group-hover/cell:scale-y-105 ${shadeFor(m.count)}`}
                />
              </li>
            ))}
          </ol>

          {/* Year ticks under the first cell of each January, so the strip is readable
              without a label per month. */}
          <ol aria-hidden="true" className="mt-2 flex gap-[3px]">
            {months.map((m) => (
              <li key={m.month} className="flex-1 text-center font-mono text-[9px] text-muted-foreground/50">
                {m.month.endsWith('-01') ? m.month.slice(2, 4) : ''}
              </li>
            ))}
          </ol>
        </figure>

        {/* ---- languages ---- */}
        {languages.length > 0 && (
          <ul className="mt-10 flex flex-wrap gap-2">
            {languages.map((lang) => (
              <li
                key={lang.name}
                className="inline-flex items-center gap-2 rounded-sm border border-border/50 bg-card/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {lang.name}
                <span className="tabular text-system/80">{lang.count}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ---- recently pushed ---- */}
        {recent.length > 0 && (
          <div className="mt-12">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-system/70">
              Recently pushed
            </h3>
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {recent.map((repo) => (
                <li key={repo.name}>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group/repo flex h-full flex-col rounded-md border border-border/50 bg-card/60 p-4 backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-accent/40 hover:shadow-glow"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-mono text-sm text-foreground transition-colors group-hover/repo:text-accent">
                        {repo.name}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-300 group-hover/repo:-translate-y-0.5 group-hover/repo:translate-x-0.5"
                      />
                    </span>

                    {repo.description && (
                      <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {repo.description}
                      </span>
                    )}

                    <span className="mt-auto flex items-center gap-3 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {repo.language && <span className="text-system/80">{repo.language}</span>}
                      <span className="tabular">{monthYear(repo.pushedAt)}</span>
                    </span>
                    <span className="sr-only">(opens on GitHub in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
