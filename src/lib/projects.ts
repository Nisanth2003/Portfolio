import rawFile from '@/data/projects.json';
import { ProjectSchema, ProjectsFileSchema, type Project } from './schema';

/**
 * Validation happens here, at module load, which means it happens during
 * `next build`. A malformed row fails the build with the offending sheet row
 * number instead of silently rendering a broken card in production.
 */
function loadProjects(): Project[] {
  const file = ProjectsFileSchema.safeParse(rawFile);
  if (!file.success) {
    throw new Error(
      `src/data/projects.json is malformed. Re-run \`npm run data\`.\n${file.error.message}`,
    );
  }

  const parsed: Project[] = [];
  const problems: string[] = [];

  file.data.projects.forEach((row, i) => {
    const result = ProjectSchema.safeParse(row);
    if (!result.success) {
      const where =
        row && typeof row === 'object' && '_sheetRow' in row
          ? `sheet row ${(row as { _sheetRow?: number })._sheetRow}`
          : `entry ${i + 1}`;
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`)
        .join('; ');
      problems.push(`${where} — ${detail}`);
      return;
    }
    parsed.push(result.data);
  });

  if (problems.length) {
    throw new Error(
      `${problems.length} project row(s) failed validation. Fix the sheet, then rebuild:\n  - ` +
        problems.join('\n  - '),
    );
  }

  return parsed.sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      a.order - b.order ||
      (b.year ?? 0) - (a.year ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

export const projects: Project[] = loadProjects();

export const dataSource = (rawFile as { source?: string }).source ?? 'unknown';
export const dataGeneratedAt = (rawFile as { generatedAt?: string }).generatedAt ?? null;

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export const featuredProjects = projects.filter((p) => p.featured);

export type Filter = { name: string; count: number; field: 'tech' | 'category' };

const MAX_FILTERS = 8;

function countBy(pick: (p: (typeof projects)[number]) => string[]) {
  const counts = new Map<string, number>();
  for (const p of projects) {
    for (const value of pick(p)) {
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Filter chips, ordered by how often each value appears.
 *
 * A filter that matches exactly one project is not a filter, it's a second way to
 * click the same card — and with a handful of projects every tech has a count of 1,
 * which produces a wall of useless chips. So: only offer values shared by at least
 * two projects. Early on that means no tech chips at all and we fall back to broad
 * categories; as the portfolio grows, real tech filters appear on their own.
 */
export function projectFilters(): Filter[] {
  const shared = (counts: Map<string, number>, field: Filter['field']): Filter[] =>
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([name, count]) => ({ name, count, field }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_FILTERS);

  const tech = shared(countBy((p) => p.tech), 'tech');
  if (tech.length >= 2) return tech;

  const categories = shared(countBy((p) => [p.category]), 'category');
  return categories.length >= 2 ? categories : [];
}

export const summaryStats = {
  projectCount: projects.length,
  shippedCount: projects.filter((p) => p.status === 'shipped').length,
  liveCount: projects.filter((p) => p.liveUrl).length,
  sourceCount: projects.filter((p) => p.repoUrl).length,
  techCount: new Set(projects.flatMap((p) => p.tech)).size,
};

/** Every distinct technology, most-used first. Feeds the "skills acquired" ticker. */
export const allTech: string[] = [...countBy((p) => p.tech).entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name]) => name);

/** Headline stats, with zeroes dropped — "Live: 0" is an admission, not a stat. */
export const headlineStats: { label: string; value: number }[] = [
  { label: 'Shipped', value: summaryStats.shippedCount },
  { label: 'Live', value: summaryStats.liveCount },
  { label: 'Source', value: summaryStats.sourceCount },
  { label: 'Technologies', value: summaryStats.techCount },
].filter((s) => s.value > 0);
