import { ClipWipe, Parallax, ScrollRule } from '@/components/motion/scroll-fx';
import { stackColumns, stackGroups } from '@/lib/stack';
import { StackColumns } from './stack-columns';

export function StackSection() {
  const groups = stackGroups();

  // Nothing in the sheet yet, or no Stack tab at all. Render nothing rather than an
  // empty heading — a "Stack" section with no stack reads as a broken build.
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const columns = stackColumns();

  return (
    <section id="stack" aria-labelledby="stack-heading" className="relative border-t border-border/40">
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

      <div className="container max-w-7xl py-24">
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
          <Parallax distance={40}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">Loadout</p>
            <ScrollRule className="mt-3 w-28" />
            <ClipWipe>
              <h2
                id="stack-heading"
                className="mt-4 text-balance text-headline font-bold text-monarch"
              >
                {total} {total === 1 ? 'tool' : 'tools'} I actually reach for
              </h2>
            </ClipWipe>
            <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              Kept in the same spreadsheet as the projects, so it stays honest — this
              list changes when what I use changes, not when I remember to edit a file.
            </p>
          </Parallax>

          {/* The columns run themselves. Each category block travels with its own
              column, so the labels stay attached to the tools they describe. */}
          <StackColumns columns={columns} />
        </div>
      </div>
    </section>
  );
}
