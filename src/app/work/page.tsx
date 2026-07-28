import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ClipWipe, ScrollRule } from '@/components/motion/scroll-fx';
import { ProjectStrata } from '@/components/work/project-strata';
import { projectFilters, projects, summaryStats } from '@/lib/projects';

export const metadata: Metadata = {
  title: 'Archive',
  description: `Every project, ${summaryStats.projectCount} in total, from the surface down.`,
  alternates: { canonical: '/work/' },
};

/**
 * The full archive, as strata.
 *
 * One list, filterable, in normal document flow. There is deliberately no second copy of
 * the projects on this page: the previous version rendered a 3D stairwell *and* a grid
 * underneath, because the stairwell disappeared entirely under prefers-reduced-motion and
 * something had to be left. Strata need no understudy.
 */
export default function WorkPage() {
  const filters = projectFilters();
  const { projectCount } = summaryStats;

  return (
    <div>
      <header className="relative">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

        <div className="container max-w-7xl pb-12 pt-28">
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
              {projectCount} deep.
            </h1>
          </ClipWipe>
          <p className="mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Every project, newest at the surface. Keep going down — the further you get, the
            further back it goes.
          </p>
        </div>
      </header>

      <section
        id="strata"
        aria-labelledby="strata-heading"
        className="relative border-t border-border/40"
      >
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

        <div className="container max-w-7xl py-16">
          <h2 id="strata-heading" className="sr-only">
            Every project, by depth
          </h2>

          <ProjectStrata projects={projects} filters={filters} />
        </div>
      </section>
    </div>
  );
}
