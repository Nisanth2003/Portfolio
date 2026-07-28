'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Code2, Globe, Lock, SearchX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setAccent } from '@/components/smoke/smoke-store';
import { cn } from '@/lib/utils';
import type { Filter } from '@/lib/projects';
import type { Project } from '@/lib/schema';

/**
 * The archive as strata: bands of rock you pass through on the way down.
 *
 * This replaces a CSS-3D spiral stairwell, and the reasons it replaces it are worth
 * keeping written down, because the stairwell was the more impressive demo:
 *
 *   - It cost 1240vh of scrolling to show thirteen projects, one at a time, and only
 *     ever one was readable. Everything else was foreshortened to a sliver.
 *   - Perspective fought the type. A landing swung 24° off-axis is a plaque you have to
 *     read at an angle, and the text was the point.
 *   - It rendered nothing at all under prefers-reduced-motion, so the page had to carry a
 *     duplicate grid underneath — thirteen projects twice in one document.
 *   - It needed a hijacked sticky viewport, which on a phone meant a card covering the
 *     very staircase that made it a staircase.
 *
 * Strata keep the one good idea — you are descending, and depth means progress — and drop
 * the machinery. Ordinary document flow, ordinary type, one horizontal rule per project
 * like a survey marker, and a depth gauge tracking how far down you are. Nothing is
 * transformed, so nothing distorts; it works identically with motion turned off, which is
 * why there is no fallback list any more. This *is* the list.
 */

/** Metres per stratum. Arbitrary, consistent, and it makes the gauge legible. */
const DEPTH_PER_STRATUM = 30;

const STATUS_LABEL: Record<Project['status'], string> = {
  shipped: 'Cleared',
  wip: 'In progress',
  archived: 'Archived',
};

const DEFAULT_ACCENT = '#A855F7';

const depthOf = (index: number) => index * DEPTH_PER_STRATUM;
const formatDepth = (metres: number) => `${String(metres).padStart(3, '0')} m`;

export function ProjectStrata({
  projects,
  filters,
}: {
  projects: Project[];
  filters: Filter[];
}) {
  const [active, setActive] = useState<Filter | null>(null);
  const [current, setCurrent] = useState(0);
  const strataRefs = useRef<(HTMLLIElement | null)[]>([]);

  const shown = useMemo(() => {
    if (!active) return projects;
    return projects.filter((p) =>
      active.field === 'tech' ? p.tech.includes(active.name) : p.category === active.name,
    );
  }, [projects, active]);

  /**
   * Which stratum you are currently in.
   *
   * An IntersectionObserver with the root inset to the middle 10% of the viewport, rather
   * than a scroll handler doing arithmetic: the browser already knows which element crosses
   * the centre line, it reports it off the main thread, and there is no per-frame work at
   * all. The stairwell's equivalent ran every frame in requestAnimationFrame.
   */
  useEffect(() => {
    const elements = strataRefs.current.filter((el): el is HTMLLIElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(index)) setCurrent(index);
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [shown.length]);

  // A filter change renumbers everything, so the gauge must not keep pointing at floor 9.
  useEffect(() => setCurrent(0), [active]);

  return (
    <div>
      {filters.length > 0 && (
        <div
          role="group"
          aria-label="Filter projects by technology"
          className="flex flex-wrap gap-2"
        >
          <FilterChip active={active === null} onClick={() => setActive(null)}>
            All<Count>{projects.length}</Count>
          </FilterChip>

          {filters.map((filter) => (
            <FilterChip
              key={`${filter.field}:${filter.name}`}
              active={active?.name === filter.name}
              onClick={() => setActive(active?.name === filter.name ? null : filter)}
            >
              {filter.name}
              <Count>{filter.count}</Count>
            </FilterChip>
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {shown.length} {shown.length === 1 ? 'project' : 'projects'}
        {active ? ` matching ${active.name}` : ''}
      </p>

      {shown.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border/60 px-6 py-16 text-center">
          <SearchX aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 font-medium text-foreground">Nothing matching {active?.name} yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            That is a gap, not an error. Try another filter.
          </p>
          <Button variant="outline" size="sm" className="mt-6" onClick={() => setActive(null)}>
            Show everything
          </Button>
        </div>
      ) : (
        <div className="mt-10 grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_4.5rem]">
          <ol className="min-w-0">
            {shown.map((project, i) => (
              <Stratum
                key={project.slug}
                ref={(el) => {
                  strataRefs.current[i] = el;
                }}
                project={project}
                index={i}
                total={shown.length}
                isCurrent={i === current}
              />
            ))}

            {/* The floor of the shaft. Without it the last stratum just stops, and the
                gauge has nothing to count up to. */}
            <li aria-hidden="true" className="relative pt-10">
              <div className="h-px w-full bg-gradient-to-r from-border/60 via-border/30 to-transparent" />
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">
                Bedrock · {formatDepth(depthOf(shown.length))}
              </p>
            </li>
          </ol>

          <DepthGauge count={shown.length} current={current} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ a stratum */

type StratumProps = {
  project: Project;
  index: number;
  total: number;
  isCurrent: boolean;
};

function Stratum({
  project,
  index,
  total,
  isCurrent,
  ref,
}: StratumProps & { ref: React.Ref<HTMLLIElement> }) {
  const accent = project.accentColor ?? DEFAULT_ACCENT;

  return (
    <li
      ref={ref}
      data-index={index}
      data-current={isCurrent || undefined}
      className="group/stratum relative"
      onMouseEnter={() => setAccent(project.accentColor)}
      onMouseLeave={() => setAccent(null)}
    >
      {/* The survey rule. Two lines, the top one in the project's own colour, so the bands
          are told apart by something other than their content. */}
      <div
        aria-hidden="true"
        className="h-px w-full transition-opacity duration-500"
        style={{
          background: `linear-gradient(90deg, ${accent}, ${accent}33 45%, transparent 80%)`,
          opacity: isCurrent ? 1 : 0.45,
        }}
      />
      <div aria-hidden="true" className="mt-[2px] h-px w-full bg-border/25" />

      {/* Accent wash, only for the band you are in. This is the whole "you are here"
          signal — no dimming of the others, because a wall of dimmed text is harder to
          scan than a wall of plain text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-[1] h-full transition-opacity duration-700"
        style={{
          background: `linear-gradient(180deg, ${accent}14, transparent 60%)`,
          opacity: isCurrent ? 1 : 0,
        }}
      />

      <div className="grid gap-x-8 gap-y-5 py-10 sm:grid-cols-[7rem_minmax(0,1fr)] sm:py-14">
        {/* ---- marker ---- */}
        <div className="flex items-baseline gap-4 sm:flex-col sm:items-start sm:gap-1">
          <span
            className={cn(
              'tabular font-mono text-3xl font-bold leading-none transition-colors duration-500 sm:text-4xl',
              isCurrent ? 'text-foreground' : 'text-muted-foreground/35',
            )}
            style={isCurrent ? { color: accent } : undefined}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className={cn(
              'font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-500',
              isCurrent ? 'text-system' : 'text-muted-foreground/45',
            )}
          >
            {formatDepth(depthOf(index))}
          </span>
          <span className="sr-only">
            Stratum {index + 1} of {total}
          </span>
        </div>

        {/* ---- content ---- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {project.status !== 'shipped' && (
              <Badge variant={project.status === 'wip' ? 'wip' : 'archived'} className="text-[10px]">
                {STATUS_LABEL[project.status]}
              </Badge>
            )}
            {project.category && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-system/70">
                {project.category}
              </span>
            )}
            {project.year && (
              <span className="tabular font-mono text-[10px] text-muted-foreground/70">
                {project.year}
              </span>
            )}
            {project.codeOnly && (
              <Badge variant="system" className="text-[10px]">
                <Code2 aria-hidden="true" className="size-3" />
                Code only
              </Badge>
            )}
            {!project.liveUrl && !project.repoUrl && (
              <Badge variant="archived" className="text-[10px]">
                <Lock aria-hidden="true" className="size-3" />
                Private
              </Badge>
            )}
          </div>

          <h3 className="mt-3 text-balance text-2xl font-bold leading-tight tracking-tight text-foreground transition-colors duration-300 group-hover/stratum:text-accent sm:text-3xl">
            <Link
              href={`/work/${project.slug}`}
              className="rounded-sm after:absolute after:inset-0 after:content-['']"
            >
              {project.title}
              <span className="sr-only"> — read the case study</span>
            </Link>
          </h3>

          {project.tagline && (
            <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {project.tagline}
            </p>
          )}

          {project.tech.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {project.tech.slice(0, 6).map((tech) => (
                <li key={tech}>
                  <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                    {tech}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {/* Above the stretched link so these keep their own clicks. */}
          <div className="relative z-10 mt-6 flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-foreground/80 transition-colors group-hover/stratum:text-accent">
              Case study
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </span>

            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open the live site for ${project.title} in a new tab`}
                className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
              >
                <Globe aria-hidden="true" className="size-3.5" />
                Live
              </a>
            )}
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`View the source for ${project.title} on GitHub in a new tab`}
                className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-system"
              >
                <Code2 aria-hidden="true" className="size-3.5" />
                Source
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------- depth gauge */

/**
 * The gauge. Sticky, one tick per stratum, and the current depth in large numerals.
 *
 * Desktop only, and that is a design decision rather than a cop-out: on a narrow screen a
 * 4.5rem rail costs a sixth of the width to say something each stratum already prints next
 * to its own number.
 */
function DepthGauge({ count, current }: { count: number; current: number }) {
  return (
    <aside
      aria-hidden="true"
      className="hidden lg:block"
    >
      <div className="sticky top-24 flex flex-col items-start">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/50">
          Depth
        </span>

        <span className="tabular mt-2 font-mono text-2xl font-bold leading-none text-foreground">
          {String(depthOf(current)).padStart(3, '0')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          metres
        </span>

        <ol className="mt-5 flex flex-col gap-1.5">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  'block h-px transition-all duration-500',
                  i === current ? 'w-6 bg-accent' : i < current ? 'w-3 bg-border' : 'w-2 bg-border/50',
                )}
              />
              {i === current && (
                <span className="tabular font-mono text-[9px] text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
              )}
            </li>
          ))}
        </ol>

        <span className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40">
          {String(current + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- chips */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-200',
        active
          ? 'border-accent/60 bg-accent/15 text-foreground'
          : 'border-border/60 text-muted-foreground hover:border-border hover:bg-secondary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tabular text-xs text-muted-foreground/70">{children}</span>;
}
