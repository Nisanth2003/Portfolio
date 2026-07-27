import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ClipWipe, ScrollRule } from '@/components/motion/scroll-fx';
import { ProjectGrid } from '@/components/work/project-grid';
import { ProjectStairwell } from '@/components/work/project-stairwell';
import { projectFilters, projects, summaryStats } from '@/lib/projects';

export const metadata: Metadata = {
  title: 'Archive',
  description: `Every project, ${summaryStats.projectCount} in total — walk down the stairwell or take the list.`,
  alternates: { canonical: '/work/' },
};

export default function WorkPage() {
  const filters = projectFilters();
  const { projectCount } = summaryStats;

  return (
    <div>
      <header className="relative">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

        <div className="container max-w-7xl pb-14 pt-28">
          <Link
            href="/#work"
            className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back home
          </Link>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-system">
            Archive
          </p>
          <ScrollRule className="mt-3 w-40" />
          <ClipWipe>
            <h1 className="mt-4 max-w-3xl text-balance text-display font-bold text-monarch">
              {projectCount} {projectCount === 1 ? 'floor' : 'floors'} down.
            </h1>
          </ClipWipe>
          <p className="mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Every project, one per landing. Scroll to walk down the shaft — or skip the
            descent and take the list at the bottom.
          </p>
        </div>
      </header>

      {/* The descent. Renders nothing under prefers-reduced-motion, which is why the grid
          below is not optional. */}
      <ProjectStairwell projects={projects} />

      <section
        id="archive"
        aria-labelledby="archive-heading"
        className="relative border-t border-border/40"
      >
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

        <div className="container max-w-7xl py-24">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">Index</p>
          <ScrollRule className="mt-3 w-28" />
          <h2 id="archive-heading" className="mt-4 text-balance text-headline font-bold text-monarch">
            The whole archive, flat
          </h2>
          <p className="mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
            Same projects, filterable, no stairs.
          </p>

          <div className="mt-12">
            <ProjectGrid projects={projects} filters={filters} />
          </div>
        </div>
      </section>
    </div>
  );
}
