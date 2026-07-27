'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronsDown, Code2, Globe } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { setAccent } from '@/components/smoke/smoke-store';
import type { Project } from '@/lib/schema';

/**
 * The archive as a spiral stairwell: you stand in the middle of a cylindrical shaft and
 * scrolling walks you down it, one project per landing.
 *
 * Built with CSS 3D rather than three.js, deliberately. The page already runs a WebGL
 * context for the smoke, and a second canvas would cost a second one — but the real
 * reason is that every landing here is ordinary DOM. The titles are selectable, the
 * links are real links that a keyboard reaches and a crawler indexes, and the whole
 * thing degrades to a list. Rendering this in a canvas would mean re-implementing all of
 * that badly.
 *
 * The geometry, once, because the rest of the file is meaningless without it:
 *
 *   - The viewer sits on the shaft's axis, looking at the wall. Landing `i` is placed at
 *     `translateY(i·DROP) rotateY(i·SPIN) translateZ(-RADIUS)`, which puts it on a helix
 *     around that axis and — because the element's own +Z ends up pointing back at the
 *     axis — facing inward at the viewer without any extra rotation.
 *   - Descending is the tower moving, not a camera. Scroll progress becomes a floating
 *     "floor depth" `d`, and the tower gets `translateY(-d·DROP) rotateY(-d·SPIN)`.
 *     Rotation about Y commutes with translation along Y, so those two transforms
 *     collapse: landing `i` ends up at height `(i-d)·DROP` and angle `(i-d)·SPIN`. At
 *     `d = i` that is dead ahead at eye level, and every other landing is above or below
 *     you and swung around the shaft. That identity is the whole trick.
 *   - Treads run the same helix at a finer pitch and a slightly smaller radius, laid flat
 *     with `rotateX`, so the landings sit at the outer edge of a continuous staircase.
 *
 * Per frame only two things are written: the tower's transform, and a `--near` custom
 * property on each landing. Landing transforms are static — they only change on resize,
 * when the radius is re-derived from the viewport.
 */

/** Degrees around the shaft between consecutive landings. */
const SPIN = 108;
/** Vertical drop between consecutive landings, px. */
const DROP = 300;
/** Treads per landing-to-landing flight. */
const TREADS_PER_FLIGHT = 9;
/** How far the treads sit inside the landings, px. */
const TREAD_INSET = 52;
/** Page scroll spent per flight, in vh. */
const VH_PER_FLIGHT = 85;
/** Landings are lit from `--near` = 1 (dead ahead) down to 0 this many floors away. */
const FALLOFF = 1.15;

/** Radius of the shaft, from the viewport width. Narrow screens need a tighter shaft or
 *  the landing is pushed so far back that perspective shrinks it to nothing. */
function radiusFor(width: number) {
  return Math.round(Math.min(440, Math.max(230, width * 0.4)));
}

export function ProjectStairwell({ projects }: { projects: Project[] }) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const towerRef = useRef<HTMLDivElement>(null);
  const landingRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [radius, setRadius] = useState(() =>
    radiusFor(typeof window === 'undefined' ? 1280 : window.innerWidth),
  );
  const [active, setActive] = useState(0);

  const count = projects.length;

  /**
   * Floors of travel. `count - 1` would land exactly on the last project as the section
   * ends, but it is also 0 when there is one project, which would freeze the shaft — so
   * there is always at least most of a flight to walk.
   */
  const travel = Math.max(count - 1, 0.8);
  /**
   * Descent runs from slightly above the first landing to slightly below the last, so
   * the first one arrives rather than already being there, and the last one is properly
   * passed instead of stopping dead in front of it.
   */
  const depthAt = (progress: number) => -0.2 + progress * (travel + 0.4);

  const treads = useMemo(() => {
    // One extra flight above and below, so the staircase leaves the frame at both ends
    // instead of visibly starting and stopping.
    const first = -TREADS_PER_FLIGHT;
    const last = Math.ceil((travel + 1) * TREADS_PER_FLIGHT);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }, [travel]);

  useEffect(() => {
    const onResize = () => setRadius(radiusFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    let frame = 0;
    let current = -1;

    const apply = () => {
      frame = 0;
      const section = sectionRef.current;
      const tower = towerRef.current;
      if (!section || !tower) return;

      const rect = section.getBoundingClientRect();
      const span = section.offsetHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      const depth = depthAt(progress);

      tower.style.transform = `translateY(${-depth * DROP}px) rotateY(${-depth * SPIN}deg)`;

      for (let i = 0; i < landingRefs.current.length; i++) {
        const el = landingRefs.current[i];
        if (!el) continue;
        const near = Math.max(0, 1 - Math.abs(i - depth) / FALLOFF);
        el.style.setProperty('--near', near.toFixed(3));
        // Landings swung round the back of the shaft still occupy screen space in front
        // of the ones you can see, so anything not roughly ahead of you must stop
        // catching clicks.
        el.style.pointerEvents = near > 0.55 ? 'auto' : 'none';
      }

      const nearest = Math.min(count - 1, Math.max(0, Math.round(depth)));
      if (nearest !== current) {
        current = nearest;
        setActive(nearest);
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // depthAt is derived from travel; nothing else in it can change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, travel, count]);

  if (count === 0) return null;

  /**
   * Under prefers-reduced-motion there is no stairwell at all. This is a scroll-driven
   * 3D descent — there is no reduced version of it that is still the same thing — and
   * the full archive grid directly below is the same projects, in order, with filters.
   */
  if (reduceMotion) return null;

  const treadRadius = radius - TREAD_INSET;

  return (
    <div
      ref={sectionRef}
      className="relative"
      style={{ height: `calc(100vh + ${(travel + 0.4) * VH_PER_FLIGHT}vh)` }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* The shaft recedes into the dark at both ends, which is what stops the helix
            reading as a ring of floating cards. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(70%_55%_at_50%_46%,transparent,hsl(var(--background)/0.55)_72%,hsl(var(--background))_100%)]"
        />

        <div
          className="absolute inset-0 [perspective-origin:50%_46%] [perspective:1200px]"
          // Nothing here is content — the landings below are duplicated by the archive
          // grid, and this container only exists to hold the geometry.
        >
          <div
            ref={towerRef}
            className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] will-change-transform"
          >
            {/* ---- shaft ribs ----
                Twelve hairlines standing at the wall radius, evenly around the axis.
                They are what makes the space read as a cylinder rather than a helix of
                floating cards.

                The first attempt here was a solid central column, on the theory that a
                spiral staircase wraps a newel post. It does — but the viewer stands ON
                the axis, so the post ends up between the camera and every landing and
                blots out the card you are meant to be reading. Anything solid has to
                live outside the landings, and out there it would also hide the smoke,
                so: lines, not surfaces. */}
            {Array.from({ length: 12 }, (_, j) => (
              <div
                key={`rib-${j}`}
                aria-hidden="true"
                className="absolute left-0 top-0"
                style={{
                  width: 1,
                  height: (travel + 3) * DROP,
                  transform: `translateY(${((travel - 1) / 2) * DROP}px) rotateY(${j * 30}deg) translateZ(${-(radius + 190)}px) translate(-50%, -50%)`,
                  background:
                    'linear-gradient(180deg, transparent, hsl(var(--system) / 0.22) 22%, hsl(var(--accent) / 0.22) 78%, transparent)',
                }}
              />
            ))}

            {/* ---- treads and handrail ---- */}
            {treads.map((k) => {
              const y = (k * DROP) / TREADS_PER_FLIGHT;
              const angle = (k * SPIN) / TREADS_PER_FLIGHT;
              const base = `translateY(${y}px) rotateY(${angle}deg)`;
              return (
                <div key={`tread-${k}`} aria-hidden="true">
                  <div
                    className="absolute left-0 top-0 rounded-[2px] border border-system/20 bg-gradient-to-b from-system/[0.14] to-accent/[0.05]"
                    style={{
                      width: 196,
                      height: 46,
                      // rotateX lays the tread flat. Not a full 90°: dead flat treads at
                      // eye level project to invisible lines, and leaving some face on
                      // them keeps the flight continuous as it passes you.
                      transform: `${base} translateZ(${-treadRadius}px) rotateX(74deg) translate(-50%, -50%)`,
                    }}
                  />
                  {/* Handrail: one post per tread, at hand height above it. */}
                  <div
                    className="absolute left-0 top-0 rounded-full bg-accent/45"
                    style={{
                      width: 5,
                      height: 5,
                      transform: `${base} translateY(-104px) translateZ(${-treadRadius - 26}px) translate(-50%, -50%)`,
                    }}
                  />
                </div>
              );
            })}

            {/* ---- the landings ---- */}
            {projects.map((project, i) => {
              const accent = project.accentColor ?? '#A855F7';
              return (
                <div
                  key={project.slug}
                  ref={(el) => {
                    landingRefs.current[i] = el;
                  }}
                  className="absolute left-0 top-0"
                  style={{
                    transform: `translateY(${i * DROP}px) rotateY(${i * SPIN}deg) translateZ(${-radius}px) translate(-50%, -50%)`,
                    // Seeded for the state the scroll handler has not run in yet — first
                    // paint, and the server-rendered HTML. Without it the top landing is
                    // at 6% opacity for the first frame, which reads as a flash.
                    ['--near' as string]: i === 0 ? 1 : 0,
                    // Both driven by --near, written per frame: a landing fades and
                    // recedes as it swings away rather than popping out of existence.
                    opacity: 'calc(0.06 + var(--near, 0) * 0.94)',
                    filter: 'blur(calc((1 - var(--near, 0)) * 3px))',
                  }}
                  onMouseEnter={() => setAccent(project.accentColor)}
                  onMouseLeave={() => setAccent(null)}
                >
                  <Landing project={project} index={i} total={count} accent={accent} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- floor readout ---- */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4]">
          <div className="container flex max-w-7xl items-end justify-between gap-4 pb-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system/80">
              <span className="tabular text-foreground">
                B{String(active + 1).padStart(2, '0')}
              </span>
              <span className="text-muted-foreground/60"> / B{String(count).padStart(2, '0')}</span>
              <span className="ml-3 hidden text-muted-foreground/60 sm:inline">
                {projects[active]?.title}
              </span>
            </p>

            {active === 0 && (
              <p className="flex animate-pulse items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Keep scrolling
                <ChevronsDown aria-hidden="true" className="size-3.5" />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One landing's plaque. Plain DOM, so everything on it works the way it looks. */
function Landing({
  project,
  index,
  total,
  accent,
}: {
  project: Project;
  index: number;
  total: number;
  accent: string;
}) {
  return (
    <article
      className="w-[min(26rem,80vw)] rounded-md border border-border/60 bg-card/85 p-6 shadow-glow-system"
      style={{ borderColor: `${accent}55` }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">
          Floor B{String(index + 1).padStart(2, '0')}
          <span className="text-muted-foreground/50"> / B{String(total).padStart(2, '0')}</span>
        </p>
        {project.year && (
          <span className="tabular font-mono text-[10px] text-muted-foreground">{project.year}</span>
        )}
      </div>

      <span
        aria-hidden="true"
        className="mt-3 block h-px w-full"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />

      <h3 className="mt-4 text-balance text-2xl font-bold leading-tight text-foreground">
        {project.title}
      </h3>

      {project.tagline && (
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {project.tagline}
        </p>
      )}

      {project.tech.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {project.tech.slice(0, 4).map((tech) => (
            <li key={tech}>
              <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                {tech}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Link
          href={`/work/${project.slug}`}
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:text-accent"
        >
          Case study
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>

        <div className="flex items-center gap-1">
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open the live site for ${project.title} in a new tab`}
              className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
            >
              <Globe aria-hidden="true" className="size-4" />
            </a>
          )}
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`View the source for ${project.title} on GitHub in a new tab`}
              className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-system/15 hover:text-system"
            >
              <Code2 aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
