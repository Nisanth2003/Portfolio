import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ClipWipe, ScrollReveal3D, ScrollRule } from '@/components/motion/scroll-fx';
import { StackTile } from '@/components/stack/stack-tile';
import { stackGroups } from '@/lib/stack';

const groups = stackGroups();
const total = groups.reduce((n, g) => n + g.items.length, 0);

export const metadata: Metadata = {
  title: 'Loadout',
  description: `Every tool, ${total} in total, grouped by what it is for.`,
  alternates: { canonical: '/stack/' },
};

/**
 * The whole loadout, standing still.
 *
 * The home section shows it as self-scrolling columns, which is good for a glance and bad
 * for finding one specific thing. This is the same data laid flat: nothing moves, every
 * tile is on screen at once, and it is what "View all" is for.
 */
export default function StackPage() {
  return (
    <div>
      <header className="relative">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

        <div className="container max-w-7xl pb-14 pt-28">
          <Link
            href="/#stack"
            className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back home
          </Link>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-system">
            Loadout
          </p>
          <ScrollRule className="mt-3 w-40" />
          <ClipWipe>
            <h1 className="mt-4 max-w-3xl text-balance text-display font-bold text-monarch">
              {total} {total === 1 ? 'tool' : 'tools'}, all of them.
            </h1>
          </ClipWipe>
          <p className="mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Grouped by what each one is for. Kept in the same spreadsheet as the projects, so
            it changes when what I use changes — not when I remember to edit a file.
          </p>
        </div>
      </header>

      <section
        aria-labelledby="loadout-heading"
        className="relative border-t border-border/40"
      >
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

        <div className="container max-w-7xl py-20">
          <h2 id="loadout-heading" className="sr-only">
            Every tool, by category
          </h2>

          {groups.length === 0 ? (
            <p className="text-muted-foreground">Nothing in the Stack tab yet.</p>
          ) : (
            <div className="space-y-14">
              {groups.map((group, gi) => (
                <ScrollReveal3D
                  key={group.category}
                  intensity={0.45}
                  from={gi % 2 === 0 ? 'left' : 'right'}
                >
                  <div className="flex items-center gap-4">
                    <h3 className="shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-system/80">
                      {group.category}
                    </h3>
                    <span
                      aria-hidden="true"
                      className="h-px flex-1 bg-gradient-to-r from-border to-transparent"
                    />
                    <span className="tabular shrink-0 font-mono text-[10px] text-muted-foreground/60">
                      {group.items.length}
                    </span>
                  </div>

                  <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.items.map((item) => (
                      <li key={item.slug}>
                        <StackTile item={item} />
                      </li>
                    ))}
                  </ul>
                </ScrollReveal3D>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
