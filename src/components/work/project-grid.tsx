'use client';

import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/schema';
import type { Filter } from '@/lib/projects';
import { ProjectCard } from './project-card';

export function ProjectGrid({ projects, filters }: { projects: Project[]; filters: Filter[] }) {
  const [active, setActive] = useState<Filter | null>(null);

  const shown = useMemo(() => {
    if (!active) return projects;
    return projects.filter((p) =>
      active.field === 'tech' ? p.tech.includes(active.name) : p.category === active.name,
    );
  }, [projects, active]);

  return (
    <div>
      {filters.length > 0 && (
        <div
          role="group"
          aria-label="Filter projects by technology"
          className="mb-10 flex flex-wrap gap-2"
        >
          <FilterChip active={active === null} onClick={() => setActive(null)}>
            All
            <Count>{projects.length}</Count>
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

      {/* aria-live so a filter change is announced rather than silently swapping. */}
      <p aria-live="polite" className="sr-only">
        {shown.length} {shown.length === 1 ? 'project' : 'projects'}
        {active ? ` matching ${active.name}` : ''}
      </p>

      {/* Three columns from lg, not xl, so a typical laptop fills a row instead of
          showing 2 + 1 with a hole beside the orphan. And when a 2-column layout does
          end on an odd card, that last card spans the full width rather than leaving
          dead space beside it. */}
      {shown.length > 0 ? (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 md:[&>li:last-child:nth-of-type(odd)]:col-span-2 lg:[&>li:last-child:nth-of-type(odd)]:col-span-1">
          {shown.map((project, i) => (
            <li key={project.slug} className="h-full">
              <ProjectCard project={project} index={i} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-6 py-16 text-center">
          <SearchX aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 font-medium text-foreground">
            Nothing matching {active?.name} yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            That is a gap, not an error. Try another filter.
          </p>
          <Button variant="outline" size="sm" className="mt-6" onClick={() => setActive(null)}>
            Show everything
          </Button>
        </div>
      )}
    </div>
  );
}

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
        // 36px tall with generous horizontal padding: comfortable on a mouse, and
        // the 8px gap keeps neighbouring chips from being mis-tapped on touch.
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
