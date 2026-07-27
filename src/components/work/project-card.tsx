'use client';

import Link from 'next/link';
import { useCallback, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Code2, Globe, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ScrollReveal3D } from '@/components/motion/scroll-fx';
import { setAccent, surge } from '@/components/smoke/smoke-store';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/schema';

const STATUS_LABEL: Record<Project['status'], string> = {
  shipped: 'Cleared',
  wip: 'In progress',
  archived: 'Archived',
};

const DEFAULT_ACCENT = '#A855F7';

export function ProjectCard({ project, index }: { project: Project; index: number }) {
  const prefersReducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const accent = project.accentColor ?? DEFAULT_ACCENT;

  /**
   * Tilt and glare are written straight to style, not through React state. A
   * setState per mousemove would re-render this subtree dozens of times a second;
   * transform and background-position are both compositor-friendly and cause no
   * layout, so the card cannot shift the grid while you move over it.
   */
  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion) return;
      const el = cardRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;

      el.style.transform = `rotateX(${-(py - 0.5) * 7}deg) rotateY(${(px - 0.5) * 7}deg)`;

      if (glareRef.current) {
        glareRef.current.style.background = `radial-gradient(340px circle at ${px * 100}% ${py * 100}%, ${accent}22, transparent 62%)`;
        glareRef.current.style.opacity = '1';
      }
    },
    [accent, prefersReducedMotion],
  );

  const handleEnter = useCallback(() => {
    // Pointing at a card pushes its colour into the site-wide smoke.
    setAccent(project.accentColor);
    surge(0.6);
  }, [project.accentColor]);

  const handleLeave = useCallback(() => {
    const el = cardRef.current;
    if (el) el.style.transform = 'rotateX(0deg) rotateY(0deg)';
    if (glareRef.current) glareRef.current.style.opacity = '0';
    setAccent(null);
  }, []);

  const visibleTech = project.tech.slice(0, 4);
  const hiddenTech = project.tech.length - visibleTech.length;

  return (
    // Scrubbed to this card's own scroll progress: it rotates up out of Z-space on
    // the way in and runs backwards when you scroll up. Alternating direction gives
    // the grid a hand-dealt feel instead of a uniform slide.
    <ScrollReveal3D
      className="group h-full"
      intensity={0.95}
      from={index % 2 === 0 ? 'left' : 'right'}
    >
      <div
        ref={cardRef}
        data-prox
        onMouseMove={handleMove}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={cn(
          'aura-border relative flex h-full flex-col overflow-hidden rounded-md',
          'border border-border/50 bg-card/60 backdrop-blur-sm',
          'transition-[border-color,box-shadow,transform] duration-300 ease-expo will-change-transform',
          'hover:border-accent/40 hover:shadow-glow focus-within:border-accent/40 focus-within:shadow-glow',
        )}
      >
        {/* Proximity ring. `--prox` is written by the smoke field's pointer loop and
            rises as the cursor approaches, so the card lights up on the way in rather
            than snapping on at the moment of hover. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] rounded-md ring-1 ring-accent/70"
          style={{ opacity: 'calc(var(--prox, 0) * 0.9)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 z-0 rounded-xl blur-xl"
          style={{
            opacity: 'calc(var(--prox, 0) * 0.5)',
            background: `radial-gradient(closest-side, ${accent}44, transparent)`,
          }}
        />

        {/* Cursor-tracking glare. */}
        <div
          ref={glareRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-300"
        />

        {/* Media plate. Height reserved by aspect-ratio, so no layout shift whether
            or not an image exists. */}
        <div
          className="scanline relative aspect-[2/1] w-full overflow-hidden border-b border-border/40"
          style={{
            background: `radial-gradient(120% 100% at 12% 0%, ${accent}2b, transparent 62%), linear-gradient(160deg, #150E2B, #06040F)`,
          }}
        >
          {project.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.imageUrl}
              alt={`${project.title} interface`}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-500 ease-expo group-hover:scale-[1.04]"
            />
          ) : (
            // A deliberate System plate, not a broken-image state, so a project with
            // no screenshot still looks intentional beside one that has.
            <div className="holo-grid relative flex size-full items-center justify-center">
              <span
                aria-hidden="true"
                className="relative select-none font-mono text-5xl font-bold tracking-tighter transition-transform duration-500 ease-expo group-hover:scale-105"
                style={{ color: accent, opacity: 0.38, textShadow: `0 0 30px ${accent}66` }}
              >
                {project.title.slice(0, 2).toUpperCase()}
              </span>
              {project.category && (
                <span className="absolute bottom-2.5 right-3 font-mono text-[10px] uppercase tracking-[0.2em] text-system/50">
                  {project.category}
                </span>
              )}
            </div>
          )}

          {/* Corner brackets — they extend on hover via the .system-panel utility. */}
          <div aria-hidden="true" className="system-panel absolute inset-2 opacity-60" />

          <div className="absolute left-3 top-3 z-[2] flex flex-wrap gap-1.5">
            {project.status !== 'shipped' && (
              <Badge variant={project.status === 'wip' ? 'wip' : 'archived'} className="text-[10px]">
                {STATUS_LABEL[project.status]}
              </Badge>
            )}
            {/* Sets expectations before the click rather than after it. */}
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

          <span
            aria-hidden="true"
            className="tabular absolute right-3 top-3 z-[2] font-mono text-[10px] text-muted-foreground/60"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        <div className="relative z-[2] flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors duration-300 group-hover:text-accent">
              {project.title}
            </h3>
            {project.year && (
              <span className="tabular mt-1 shrink-0 font-mono text-[10px] text-muted-foreground">
                {project.year}
              </span>
            )}
          </div>

          {project.tagline && (
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
              {project.tagline}
            </p>
          )}

          {visibleTech.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {visibleTech.map((tech) => (
                <li key={tech}>
                  <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                    {tech}
                  </Badge>
                </li>
              ))}
              {hiddenTech > 0 && (
                <li>
                  <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                    +{hiddenTech}
                  </Badge>
                </li>
              )}
            </ul>
          )}

          {/* mt-auto, so the action row sits on the card's baseline regardless of how
              many lines the tagline took. Without it, rows jitter across the grid. */}
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            {/* Stretched link: a big click target while keeping the markup valid —
                no interactive elements nested inside an anchor. */}
            <Link
              href={`/work/${project.slug}`}
              className="font-mono text-xs uppercase tracking-wider text-foreground transition-colors after:absolute after:inset-0 after:rounded-md after:content-[''] group-hover:text-system"
            >
              Case study
              <span className="sr-only">for {project.title}</span>
            </Link>

            {/* Above the stretched link, so these win the click. */}
            <div className="relative z-10 flex items-center gap-1">
              {project.liveUrl && (
                <a
                  href={project.liveUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open the live site for ${project.title} in a new tab`}
                  className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
                >
                  <Globe aria-hidden="true" className="size-4" />
                </a>
              )}
              {project.repoUrl && (
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`View the source code for ${project.title} on GitHub in a new tab`}
                  className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-system/15 hover:text-system"
                >
                  <Code2 aria-hidden="true" className="size-4" />
                </a>
              )}
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-300 ease-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-system"
              />
            </div>
          </div>
        </div>
      </div>
    </ScrollReveal3D>
  );
}
