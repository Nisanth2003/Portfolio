'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';

import { useLoopTrack } from '@/components/motion/use-loop-track';
import { cn } from '@/lib/utils';
import type { StackGroup } from '@/lib/stack';
import { StackTile } from './stack-tile';

/** Gap between tiles, between category blocks, and between repeats of a column. */
const GAP = 12;
/** Base auto-scroll speed, px per second. */
const SPEED = 34;
/**
 * Tallest a column may get, whatever it holds.
 *
 * The `max(18rem, …)` is not decoration. This is the cap on a height that is otherwise
 * driven by measurement, so anything that makes `vh` degenerate — a minimised window
 * reports a zero-height viewport — would otherwise collapse every column to nothing.
 * Clamping the viewport term from below means the worst case is a column that is too tall,
 * not one that has vanished.
 */
const MAX_HEIGHT = 'min(30rem, max(18rem, 62vh))';
/** Height before anything has been measured, so first paint is not a collapsed strip. */
const FALLBACK_HEIGHT = '22rem';

/**
 * The loadout as columns that scroll themselves.
 *
 * Every column runs its own loop at its own speed and in its own direction, which is
 * what stops the group reading as one sheet sliding past.
 *
 * Stopping one is a deliberate act: double-tap a column and it holds still and takes the
 * wheel until you double-tap again, press Escape, or tap somewhere else. Only one column
 * can be held at a time, which is why engagement lives up here rather than in each
 * column — three columns holding at once is not a state anyone would ask for, and the
 * one you just double-tapped is obviously the one you meant.
 */
export function StackColumns({ columns, total }: { columns: StackGroup[][]; total: number }) {
  const [engaged, setEngaged] = useState<number | null>(null);

  if (columns.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        {/* Says what the gesture is before anybody has to guess at it — but not on a
            phone, where the hint and the button together are wider than the screen and
            the chevrons are the obvious way in anyway. */}
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 sm:block">
          {engaged === null
            ? 'Double-tap a column to hold it'
            : 'Holding · scroll it, or double-tap to release'}
        </p>

        {/* Where "Pause all" used to be. That button was redundant once double-tap held a
            column — it duplicated an interaction the columns already had, in the spot the
            eye lands on first. This is the thing people actually want from a control row. */}
        <Link
          href="/stack"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border/60 bg-card/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
        >
          View all {total}
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
        style={{ ['--cols' as string]: columns.length }}
      >
        {columns.map((groups, index) => (
          <StackColumn
            key={groups.map((g) => g.category).join('|') || index}
            groups={groups}
            index={index}
            total={columns.length}
            engaged={engaged === index}
            onEngagedChange={(next) => setEngaged(next ? index : null)}
          />
        ))}
      </div>
    </div>
  );
}

function StackColumn({
  groups,
  index,
  total,
  engaged,
  onEngagedChange,
}: {
  groups: StackGroup[];
  index: number;
  total: number;
  engaged: boolean;
  onEngagedChange: (engaged: boolean) => void;
}) {
  const {
    viewportRef,
    trackRef,
    setRef,
    copies,
    grabbing,
    touchAction,
    setSize,
    nudge,
    idleReason,
    step,
    handlers,
  } = useLoopTrack({
      axis: 'y',
      // Alternating direction, and a slightly different speed per column so they drift out
      // of phase instead of staying locked together for the whole page.
      speed: SPEED + index * 6,
      reverse: index % 2 === 1,
      gap: GAP,
      step: 180,
      engaged,
      onEngagedChange,
    });

  const label = groups.map((group) => group.category).join(', ');

  return (
    <div className="group/col relative">
      <div
        ref={viewportRef}
        {...handlers}
        tabIndex={0}
        role="group"
        aria-label={`${label || `Column ${index + 1}`} — column ${index + 1} of ${total}. Double-tap to hold it still, or use the up and down arrow keys to scroll.`}
        className={cn(
          'fade-edges-y relative overflow-hidden rounded-md transition-shadow duration-300',
          grabbing ? 'cursor-grabbing' : 'cursor-grab',
          // Held columns are ringed, because a stopped ticker and a broken one look
          // identical otherwise.
          engaged && 'ring-1 ring-accent/50',
        )}
        style={{
          touchAction,
          /**
           * Exactly one copy tall, capped. This is what keeps a short column honest: a
           * window taller than its content shows the second copy alongside the first, so
           * a category with two tools appears to list them twice. At one copy tall the
           * tiles simply travel through the window and nothing is ever doubled.
           */
          height: setSize > 0 ? `min(${setSize}px, ${MAX_HEIGHT})` : FALLBACK_HEIGHT,
        }}
      >
        <div
          ref={trackRef}
          className="flex flex-col will-change-transform"
          style={{ gap: `${GAP}px` }}
        >
          {Array.from({ length: copies }, (_, copy) => (
            <div
              key={copy}
              // Only the first copy exists as far as assistive tech and the tab order
              // are concerned — the rest are the same links again, and `inert` is what
              // keeps them out of the tab order rather than just out of the a11y tree.
              ref={copy === 0 ? setRef : undefined}
              aria-hidden={copy > 0 || undefined}
              inert={copy > 0}
              className="flex shrink-0 flex-col"
              style={{ gap: `${GAP}px` }}
            >
              {groups.map((group) => (
                <div key={group.category}>
                  <h4 className="font-mono text-[10px] uppercase tracking-[0.25em] text-system/70">
                    {group.category}
                  </h4>
                  <ul className="mt-2 flex flex-col" style={{ gap: `${GAP - 4}px` }}>
                    {group.items.map((item) => (
                      <li key={item.slug}>
                        <StackTile item={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Chevrons: the way in for touch, and a fallback for anyone who would rather press
          a button than learn a gesture. Dimmed until the column is hovered, focused or
          held — hover changes what is *shown*, never whether the column moves. */}
      <div
        className={cn(
          'pointer-events-none absolute right-1.5 top-1.5 z-[2] flex flex-col gap-1 transition-opacity duration-300',
          engaged
            ? 'opacity-100'
            : 'opacity-40 group-hover/col:opacity-100 group-focus-within/col:opacity-100',
        )}
      >
        <Chevron label={`Scroll ${label || 'column'} up`} onClick={() => nudge(-step)}>
          <ChevronUp aria-hidden="true" className="size-3.5" />
        </Chevron>
        <Chevron label={`Scroll ${label || 'column'} down`} onClick={() => nudge(step)}>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Chevron>
      </div>

      {engaged && (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 z-[2] text-center font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
          Held · double-tap to release
        </p>
      )}

      {process.env.NODE_ENV === 'development' && <TrackState idleReason={idleReason} />}
    </div>
  );
}

/**
 * Dev-only readout of whether this column is actually advancing, and if not, which of the
 * several legitimate reasons is stopping it. Stripped from production builds.
 *
 * Worth the fifteen lines: "it isn't moving" has three or four plausible causes that are
 * all invisible from the outside — every one of them is a ref so that scrolling and
 * pointer movement never re-render the tile list — and guessing between them from a
 * screenshot is exactly what went wrong before.
 */
function TrackState({ idleReason }: { idleReason: () => string | null }) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    // Polled rather than pushed: the values it reads are deliberately outside React.
    const id = setInterval(() => setReason(idleReason()), 250);
    return () => clearInterval(id);
  }, [idleReason]);

  return (
    <span
      className={`pointer-events-none absolute left-1.5 top-1.5 z-[2] rounded-sm bg-background/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        reason ? 'text-rank' : 'text-system/70'
      }`}
    >
      {reason ?? 'moving'}
    </span>
  );
}

function Chevron({
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
      className="pointer-events-auto grid size-6 place-items-center rounded-sm border border-border/60 bg-background/70 text-muted-foreground backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
    >
      {children}
    </button>
  );
}
