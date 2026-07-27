'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

import { useLoopTrack } from '@/components/motion/use-loop-track';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/schema';
import { ProjectCard } from './project-card';

/** Gap between cards and between repeats of the set. */
const GAP = 24;
/** Auto-scroll speed, px per second. A card is ~340px wide, so this is ~7s per card. */
const SPEED = 48;

/**
 * The featured projects, travelling sideways on their own.
 *
 * Same interaction model as the stack columns: double-tap to hold it and scroll it, then
 * double-tap, Escape, or a tap elsewhere to let it go. One difference falls out of the
 * axis — a sideways trackpad swipe cannot have been meant for a vertically scrolling
 * page, so the rail accepts those even when idle.
 *
 * When there are too few projects to fill the width, the loop turns itself off and the
 * cards just sit there. Repeating two cards across the viewport would read as a bug, and
 * a portfolio's first few entries are exactly when that would be on screen.
 */
export function ProjectRail({ projects }: { projects: Project[] }) {
  const {
    viewportRef,
    trackRef,
    setRef,
    copies,
    looping,
    playing,
    grabbing,
    engaged,
    touchAction,
    togglePlaying,
    nudge,
    step,
    handlers,
  } = useLoopTrack({
    axis: 'x',
    speed: SPEED,
    gap: GAP,
    step: 360,
    staticWhenShort: true,
  });

  if (projects.length === 0) return null;

  return (
    <div>
      <div
        ref={viewportRef}
        {...handlers}
        tabIndex={looping ? 0 : -1}
        role="group"
        aria-label="Featured projects — double-tap to hold the rail still, or use the left and right arrow keys to scroll"
        className={cn(
          'relative overflow-hidden rounded-md transition-shadow duration-300',
          looping && 'fade-edges-x',
          looping && (grabbing ? 'cursor-grabbing' : 'cursor-grab'),
          engaged && 'ring-1 ring-accent/50',
        )}
        // pan-y while idle, so a sideways drag belongs to the rail and a vertical one
        // still scrolls the page; none once held, when the finger is ours.
        style={looping ? { touchAction } : undefined}
      >
        <div ref={trackRef} className="flex w-max will-change-transform" style={{ gap: `${GAP}px` }}>
          {Array.from({ length: copies }, (_, copy) => (
            <div
              key={copy}
              ref={copy === 0 ? setRef : undefined}
              // Repeats are the same cards and the same links again: out of the a11y
              // tree and out of the tab order.
              aria-hidden={copy > 0 || undefined}
              inert={copy > 0}
              className="shrink-0"
            >
              <ul className="flex" style={{ gap: `${GAP}px` }}>
                {projects.map((project, index) => (
                  <li key={`${copy}-${project.slug}`} className="w-[19rem] shrink-0 sm:w-[21rem]">
                    <ProjectCard project={project} index={index} reveal={false} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {looping && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p
            className={cn(
              'font-mono text-[10px] uppercase tracking-[0.2em]',
              engaged ? 'text-accent' : 'text-muted-foreground/70',
            )}
          >
            {engaged
              ? 'Held · scroll it, or double-tap to release'
              : 'Double-tap to hold · drag or swipe to scrub'}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            <RailButton label="Scroll the rail left" onClick={() => nudge(-step)}>
              <ChevronLeft aria-hidden="true" className="size-3.5" />
            </RailButton>
            <RailButton label="Scroll the rail right" onClick={() => nudge(step)}>
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </RailButton>
            <button
              type="button"
              onClick={togglePlaying}
              aria-pressed={!playing}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
            >
              {playing ? (
                <Pause aria-hidden="true" className="size-3" />
              ) : (
                <Play aria-hidden="true" className="size-3" />
              )}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-sm border border-border/60 bg-card/60 text-muted-foreground backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
    >
      {children}
    </button>
  );
}
